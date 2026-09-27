from typing import Literal

from fastapi import APIRouter, Query
from pydantic import BaseModel
from sqlalchemy import delete, func, select, update

from app.analytics.competencies import competency_overview
from app.analytics.insights import personal_analytics
from app.analytics.team import team_analytics
from app.api.auth import UserOut, user_out
from app.api.deps import CurrentUser, Db, TrainerUser
from app.errors import AppError
from app.gamification import achievements, challenges, points
from app.gamification.context import build_context
from app.gamification.leaderboard import leaderboard
from app.gamification.levels import level_info
from app.gamification.notifications import refresh
from app.models import (
    Attempt, AttemptEvent, Notification, User, UserAchievement, UserChallenge, UserCompetency, XpGrant,
)
from app.timeutil import UtcDatetime, utcnow

router = APIRouter(tags=["Профиль и геймификация"])


class Expiring(BaseModel):
    points: int
    expires_at: UtcDatetime


class AchievementOut(BaseModel):
    code: str
    title: str
    description: str
    icon: str
    earned_at: UtcDatetime | None
    progress: int
    target: int


class ChallengeOut(BaseModel):
    id: str
    title: str
    description: str
    ends: str
    progress: int
    target: int
    reward_xp: int
    completed_at: UtcDatetime | None


class CompetencyOut(BaseModel):
    code: str
    title: str
    description: str
    mastery: float | None
    samples: int
    status: str


class Profile(BaseModel):
    user: UserOut
    level: dict
    total_xp: int
    active_points: int
    expiring: Expiring | None
    streak_days: int
    finished_attempts: int
    achievements: list[AchievementOut]
    challenges: list[ChallengeOut]
    competencies: list[CompetencyOut]


@router.get("/profile", response_model=Profile, summary="Игровой профиль: уровень, баллы, достижения, челленджи")
def profile(db: Db, user: CurrentUser) -> Profile:
    now = utcnow()
    ctx = build_context(db, user, now)
    xp = points.total_xp(db, user.id)
    return Profile(
        user=user_out(user),
        level=level_info(xp),
        total_xp=xp,
        active_points=points.active_points(db, user.id, now),
        expiring=points.expiring_soon(db, user.id, now),
        streak_days=ctx.streak_days,
        finished_attempts=len(ctx.attempts),
        achievements=achievements.overview(db, user, ctx),
        challenges=challenges.overview(db, user, ctx.attempts, now),
        competencies=competency_overview(db, user.id),
    )


@router.post("/profile/reset", status_code=204, summary="Сбросить свою статистику: попытки, очки опыта, достижения, челленджи")
def reset_profile(db: Db, user: CurrentUser) -> None:
    # Журнал решений ссылается на попытки, поэтому удаляется первым.
    for model in (AttemptEvent, Attempt, XpGrant, UserCompetency, UserAchievement, UserChallenge, Notification):
        db.execute(delete(model).where(model.user_id == user.id))
    db.commit()


@router.get("/leaderboard", summary="Рейтинг по активным баллам (сгорают через 30 дней)")
def get_leaderboard(
    db: Db, user: CurrentUser, scope: Literal["brigade", "depot", "company"] = "brigade",
    limit: int = Query(50, ge=1, le=200),
) -> dict:
    return leaderboard(db, user, scope, utcnow(), limit)


class NotificationOut(BaseModel):
    id: int
    kind: str
    title: str
    body: str
    link: str | None
    created_at: UtcDatetime
    read_at: UtcDatetime | None


class NotificationList(BaseModel):
    unread: int
    items: list[NotificationOut]


class MarkRead(BaseModel):
    ids: list[int] | None = None  # None — отметить все


@router.get("/notifications", response_model=NotificationList, summary="Уведомления (новые сценарии, челленджи, сгорающие баллы…)")
def notifications(db: Db, user: CurrentUser, limit: int = Query(30, ge=1, le=100)) -> NotificationList:
    refresh(db, user, utcnow())
    db.commit()
    items = db.scalars(
        select(Notification).where(Notification.user_id == user.id).order_by(Notification.created_at.desc()).limit(limit)
    )
    unread = db.scalar(
        select(func.count()).where(Notification.user_id == user.id, Notification.read_at.is_(None))
    )
    return NotificationList(unread=unread, items=[NotificationOut.model_validate(n, from_attributes=True) for n in items])


@router.post("/notifications/read", status_code=204, summary="Отметить уведомления прочитанными")
def mark_read(body: MarkRead, db: Db, user: CurrentUser) -> None:
    query = update(Notification).where(Notification.user_id == user.id, Notification.read_at.is_(None))
    if body.ids is not None:
        query = query.where(Notification.id.in_(body.ids))
    db.execute(query.values(read_at=utcnow()))
    db.commit()


@router.get("/analytics/me", summary="Моя аналитика: компетенции, выводы, рекомендации")
def my_analytics(db: Db, user: CurrentUser) -> dict:
    return personal_analytics(db, user, utcnow())


@router.get("/analytics/team", summary="Аналитика по бригадам и сотрудникам (тренер)")
def team(db: Db, _: TrainerUser) -> dict:
    return team_analytics(db, utcnow())


@router.get("/analytics/users/{user_id}", summary="Аналитика конкретного сотрудника (тренер)")
def employee_analytics(user_id: int, db: Db, _: TrainerUser) -> dict:
    employee = db.get(User, user_id)
    if employee is None:
        raise AppError(404, "user_not_found", "Сотрудник не найден")
    return {"user": user_out(employee).model_dump(), **personal_analytics(db, employee, utcnow())}
