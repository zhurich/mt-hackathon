"""Прохождение сценария: старт попытки, решения игрока, разбор.

Клиент никогда не получает качество вариантов и обратную связь во время игры — только текст
ситуации, варианты и изменения шкал. Подробности открываются в разборе после финала.
"""

import random
import time
from typing import Any

from fastapi import APIRouter, Query, status
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import select, update

from app.api.deps import CurrentUser, Db
from app.engine import runtime
from app.engine.debrief import build_debrief
from app.engine.runtime import GameState
from app.engine.schema import ChoiceNode, EndingNode, Scenario
from app.engine.scoring import AttemptResult
from app.errors import AppError
from app.gamification.progress import finish_attempt
from app.models import Attempt, User
from app.scenario_store import get_scenario
from app.services import log_decision
from app.timeutil import UtcDatetime, iso_utc, utcnow

router = APIRouter(prefix="/attempts", tags=["Прохождение"])


class StartRequest(BaseModel):
    scenario_id: str


class DecisionRequest(BaseModel):
    choice_id: str | None = Field(default=None, max_length=64)
    timeout: bool = Field(default=False, description="Клиентский таймер истёк — игрок не успел ответить")

    @model_validator(mode="after")
    def one_of(self):
        if (self.choice_id is None) == (not self.timeout):
            raise ValueError("Передайте либо choice_id, либо timeout=true")
        return self


class ChoiceOut(BaseModel):
    id: str
    text: str


class NodeOut(BaseModel):
    id: str
    speaker: str
    speaker_name: str | None
    text: str
    choices: list[ChoiceOut]
    timer: int | None
    deadline_ms: int | None


class HudItem(BaseModel):
    name: str
    label: str
    value: float


class LastDecision(BaseModel):
    delta: dict[str, int]
    timed_out: bool
    interrupted: bool


class Ending(BaseModel):
    outcome: str
    title: str
    text: str


class AttemptView(BaseModel):
    id: int
    scenario_id: str
    scenario_title: str
    status: str
    loyalty: int
    safety: int
    step: int
    hud: list[HudItem]
    node: NodeOut | None
    server_time_ms: int
    last: LastDecision | None = None
    ending: Ending | None = None
    rewards: dict[str, Any] | None = None


class AttemptListItem(BaseModel):
    id: int
    scenario_id: str
    scenario_title: str
    outcome: str
    xp: int
    final_loyalty: int
    final_safety: int
    finished_at: UtcDatetime


def _load(db: Db, attempt_id: int, user: User, lock: bool = False) -> Attempt:
    query = select(Attempt).where(Attempt.id == attempt_id)
    if lock:
        query = query.with_for_update()  # защита от двойной отправки ответа (PostgreSQL)
    attempt = db.scalar(query)
    if attempt is None or attempt.user_id != user.id:
        raise AppError(404, "attempt_not_found", "Попытка не найдена")
    return attempt


def _shuffled_choices(scenario: Scenario, attempt: Attempt, state: GameState) -> list[ChoiceOut]:
    """Варианты в случайном порядке, чтобы лучший ответ нельзя было угадать по позиции.
    Порядок зависит от попытки и узла — при перезагрузке страницы он не меняется."""
    choices = [ChoiceOut(id=c.id, text=c.text) for c in runtime.available_choices(scenario, state)]
    random.Random(f"{attempt.id}:{state.node_id}").shuffle(choices)
    return choices


def _view(scenario: Scenario, attempt: Attempt, state: GameState, last: dict | None = None) -> AttemptView:
    node = scenario.nodes[state.node_id]
    node_out = ending = None
    if isinstance(node, ChoiceNode):
        deadline = runtime.deadline(scenario, state)
        node_out = NodeOut(
            id=state.node_id,
            speaker=node.speaker,
            speaker_name=node.speaker_name,
            text=node.text,
            choices=_shuffled_choices(scenario, attempt, state),
            timer=node.timer,
            deadline_ms=round(deadline * 1000) if deadline else None,
        )
    elif isinstance(node, EndingNode):
        ending = Ending(outcome=node.outcome, title=node.title, text=node.text)

    return AttemptView(
        id=attempt.id,
        scenario_id=scenario.id,
        scenario_title=scenario.title,
        status=attempt.status,
        loyalty=state.loyalty,
        safety=state.safety,
        step=len(state.path),
        hud=[HudItem(name=name, label=label, value=state.vars[name]) for name, label in scenario.hud.items()],
        node=node_out,
        server_time_ms=round(time.time() * 1000),
        last=LastDecision(
            delta=last["delta"], timed_out=last["timed_out"], interrupted=last["interrupted_to"] is not None
        ) if last else None,
        ending=ending,
        rewards=(attempt.result or {}).get("rewards"),
    )


@router.post("", response_model=AttemptView, status_code=status.HTTP_201_CREATED, summary="Начать сценарий")
def start_attempt(body: StartRequest, db: Db, user: CurrentUser) -> AttemptView:
    scenario = get_scenario(db, body.scenario_id)
    # Незавершённая попытка этого же сценария закрывается — начинаем заново.
    db.execute(
        update(Attempt)
        .where(Attempt.user_id == user.id, Attempt.scenario_id == scenario.id, Attempt.status == "active")
        .values(status="abandoned")
    )
    state = runtime.start(scenario, now=time.time())
    attempt = Attempt(
        user_id=user.id,
        scenario_id=scenario.id,
        scenario_version=scenario.version,
        category=scenario.category,
        difficulty=scenario.difficulty,
        state=state.to_dict(),
    )
    db.add(attempt)
    db.commit()
    return _view(scenario, attempt, state)


@router.get("", response_model=list[AttemptListItem], summary="История моих завершённых попыток")
def my_attempts(db: Db, user: CurrentUser, limit: int = Query(20, ge=1, le=100)) -> list[AttemptListItem]:
    attempts = db.scalars(
        select(Attempt)
        .where(Attempt.user_id == user.id, Attempt.status == "finished")
        .order_by(Attempt.finished_at.desc())
        .limit(limit)
    )
    items = []
    for attempt in attempts:
        scenario = get_scenario(db, attempt.scenario_id, attempt.scenario_version)
        items.append(AttemptListItem(
            id=attempt.id, scenario_id=attempt.scenario_id, scenario_title=scenario.title,
            outcome=attempt.outcome, xp=attempt.xp, final_loyalty=attempt.final_loyalty,
            final_safety=attempt.final_safety, finished_at=attempt.finished_at,
        ))
    return items


@router.get("/{attempt_id}", response_model=AttemptView, summary="Текущее состояние попытки")
def get_attempt(attempt_id: int, db: Db, user: CurrentUser) -> AttemptView:
    attempt = _load(db, attempt_id, user)
    scenario = get_scenario(db, attempt.scenario_id, attempt.scenario_version)
    return _view(scenario, attempt, GameState.from_dict(attempt.state))


@router.post("/{attempt_id}/decisions", response_model=AttemptView, summary="Принять решение или сообщить о таймауте")
def decide(attempt_id: int, body: DecisionRequest, db: Db, user: CurrentUser) -> AttemptView:
    attempt = _load(db, attempt_id, user, lock=True)
    if attempt.status != "active":
        raise AppError(409, "attempt_not_active", "Попытка уже завершена")
    scenario = get_scenario(db, attempt.scenario_id, attempt.scenario_version)
    state = GameState.from_dict(attempt.state)

    now = time.time()
    record = runtime.decide(scenario, state, body.choice_id, now=now, client_timeout=body.timeout)
    attempt.state = state.to_dict()
    log_decision(db, attempt, scenario, record)
    if state.finished:
        rewards = finish_attempt(db, user, attempt, scenario, state, utcnow())
        attempt.result = {**attempt.result, "rewards": rewards}
    db.commit()
    return _view(scenario, attempt, state, last=record)


@router.get("/{attempt_id}/debrief", summary="Разбор завершённой попытки")
def debrief(attempt_id: int, db: Db, user: CurrentUser) -> dict[str, Any]:
    attempt = _load(db, attempt_id, user)
    if attempt.status != "finished":
        raise AppError(409, "attempt_not_finished", "Разбор доступен после завершения сценария")
    scenario = get_scenario(db, attempt.scenario_id, attempt.scenario_version)
    state = GameState.from_dict(attempt.state)
    stored = {k: v for k, v in attempt.result.items() if k != "rewards"}
    result = AttemptResult(**stored)
    return {
        "attempt_id": attempt.id,
        "finished_at": iso_utc(attempt.finished_at),
        "result": stored,
        "rewards": attempt.result.get("rewards"),
        **build_debrief(scenario, state, result),
    }
