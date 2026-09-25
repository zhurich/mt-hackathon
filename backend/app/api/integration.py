"""API для внешних систем (HR, LMS). Аутентификация — заголовок X-API-Key.

- HR: синхронизация сотрудников (создание/обновление по внешнему id), справочник подразделений.
- LMS: результаты прохождений и журнал решений в упрощённом формате xAPI (actor / verb / object / result).
"""

from datetime import datetime

from fastapi import APIRouter, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, select

from app.analytics.competencies import mastery_map
from app.api.deps import Db, IntegrationClient
from app.errors import AppError
from app.gamification import points
from app.gamification.levels import level_info
from app.models import Attempt, AttemptEvent, OrgUnit, User
from app.security import hash_password
from app.timeutil import UtcDatetime, iso_utc, utcnow

router = APIRouter(prefix="/integration", tags=["Интеграция HR / LMS"])

XAPI_VERB = "http://adlnet.gov/expapi/verbs/"


class OrgUnitOut(BaseModel):
    id: int
    name: str
    kind: str
    parent_id: int | None


class EmployeeSync(BaseModel):
    display_name: str = Field(min_length=1, max_length=80, description="Псевдоним или ФИО в сокращённой форме")
    employee_code: str = Field(min_length=1, max_length=32, description="Табельный номер")
    brigade_id: int | None = None
    role: str = Field(default="conductor", pattern="^(conductor|trainer)$")
    login: str | None = Field(default=None, max_length=64, description="По умолчанию — табельный номер")
    initial_password: str | None = Field(default=None, min_length=8, max_length=128,
                                         description="Без пароля вход невозможен до его установки")


class EmployeeOut(BaseModel):
    external_id: str | None
    employee_code: str
    display_name: str
    role: str
    brigade: str | None
    depot: str | None
    level: str
    total_xp: int
    active_points: int
    competencies: dict[str, float]


def _employee_out(db: Db, user: User, now: datetime) -> EmployeeOut:
    xp = points.total_xp(db, user.id)
    return EmployeeOut(
        external_id=user.external_id,
        employee_code=user.employee_code,
        display_name=user.display_name,
        role=user.role,
        brigade=user.brigade.name if user.brigade else None,
        depot=user.depot.name if user.depot else None,
        level=level_info(xp)["title"],
        total_xp=xp,
        active_points=points.active_points(db, user.id, now),
        competencies={code: row.mastery for code, row in mastery_map(db, user.id).items()},
    )


@router.get("/org-units", response_model=list[OrgUnitOut], summary="Справочник депо и бригад")
def org_units(db: Db, _: IntegrationClient) -> list[OrgUnitOut]:
    return [OrgUnitOut.model_validate(unit, from_attributes=True) for unit in db.scalars(select(OrgUnit))]


@router.get("/employees", response_model=list[EmployeeOut], summary="Сотрудники с прогрессом и компетенциями")
def employees(db: Db, _: IntegrationClient) -> list[EmployeeOut]:
    now = utcnow()
    return [_employee_out(db, user, now) for user in db.scalars(select(User).order_by(User.id))]


@router.put("/employees/{external_id}", response_model=EmployeeOut, summary="Создать или обновить сотрудника из HR")
def sync_employee(external_id: str, body: EmployeeSync, db: Db, _: IntegrationClient) -> EmployeeOut:
    if body.brigade_id is not None:
        brigade = db.get(OrgUnit, body.brigade_id)
        if brigade is None or brigade.kind != "brigade":
            raise AppError(422, "unknown_brigade", f"Бригада {body.brigade_id} не найдена")

    user = db.scalar(select(User).where(User.external_id == external_id))
    login = (body.login or body.employee_code).lower()
    conflict = select(User.id).where((User.login == login) | (User.employee_code == body.employee_code))
    if user is not None:
        conflict = conflict.where(User.id != user.id)
    if db.scalar(conflict.limit(1)):
        raise AppError(409, "employee_conflict", "Логин или табельный номер уже заняты другим сотрудником")

    if user is None:
        user = User(external_id=external_id, login=login)
        db.add(user)
    user.login = login
    user.display_name = body.display_name
    user.employee_code = body.employee_code
    user.brigade_id = body.brigade_id
    user.role = body.role
    if body.initial_password:
        user.password_hash = hash_password(body.initial_password)
    db.commit()
    db.refresh(user)
    return _employee_out(db, user, utcnow())


class ResultOut(BaseModel):
    attempt_id: int
    employee_code: str
    external_id: str | None
    scenario_id: str
    scenario_version: int
    outcome: str
    xp: int
    final_loyalty: int
    final_safety: int
    competency_results: dict[str, int]
    role_model_covered: list[str]
    finished_at: UtcDatetime


@router.get("/results", response_model=list[ResultOut], summary="Результаты прохождений для LMS")
def results(
    db: Db, _: IntegrationClient,
    since: datetime | None = Query(None, description="Только завершённые после этого момента (UTC)"),
    limit: int = Query(500, ge=1, le=5000),
) -> list[ResultOut]:
    query = select(Attempt, User).join(User, User.id == Attempt.user_id).where(Attempt.status == "finished")
    if since:
        query = query.where(Attempt.finished_at > since.replace(tzinfo=None))
    rows = db.execute(query.order_by(Attempt.finished_at).limit(limit)).all()
    return [
        ResultOut(
            attempt_id=attempt.id, employee_code=user.employee_code, external_id=user.external_id,
            scenario_id=attempt.scenario_id, scenario_version=attempt.scenario_version, outcome=attempt.outcome,
            xp=attempt.xp, final_loyalty=attempt.final_loyalty, final_safety=attempt.final_safety,
            competency_results=attempt.result["competency_results"],
            role_model_covered=attempt.result["role_model_covered"], finished_at=attempt.finished_at,
        )
        for attempt, user in rows
    ]


@router.get("/events", summary="Журнал решений в упрощённом формате xAPI-statements")
def events(
    db: Db, _: IntegrationClient,
    since: datetime | None = Query(None, description="Только события после этого момента (UTC)"),
    limit: int = Query(1000, ge=1, le=10000),
) -> dict:
    query = select(AttemptEvent, User.employee_code).join(User, User.id == AttemptEvent.user_id)
    if since:
        query = query.where(AttemptEvent.created_at > since.replace(tzinfo=None))
    rows = db.execute(query.order_by(AttemptEvent.id).limit(limit)).all()
    statements = [
        {
            "id": f"vsm-event-{event.id}",
            "actor": {"account": {"homePage": "vsm-trainer", "name": employee_code}},
            "verb": {"id": XAPI_VERB + ("failed" if event.timed_out else "answered"),
                     "display": {"ru-RU": "не успел ответить" if event.timed_out else "ответил"}},
            "object": {"id": f"vsm://scenario/{event.scenario_id}/v{event.scenario_version}/node/{event.node_id}"},
            "result": {
                "response": event.choice_id,
                "extensions": {
                    "quality": event.quality,
                    "reaction_ms": event.reaction_ms,
                    "delta_loyalty": event.delta_loyalty,
                    "delta_safety": event.delta_safety,
                },
            },
            "context": {"registration": f"vsm-attempt-{event.attempt_id}"},
            "timestamp": iso_utc(event.created_at),
        }
        for event, employee_code in rows
    ]
    total = db.scalar(select(func.count()).select_from(AttemptEvent))
    return {"total": total, "statements": statements}
