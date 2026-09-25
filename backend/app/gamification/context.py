"""Срез прогресса сотрудника — всё, что нужно для проверки правил достижений и челленджей."""

from dataclasses import dataclass
from datetime import date, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.analytics.competencies import mastery_map
from app.gamification.levels import level_info
from app.gamification.points import total_xp
from app.models import Attempt, User
from app.scenario_store import latest_rows

# Дни тренировок считаем по московскому времени.
MSK_OFFSET = timedelta(hours=3)


@dataclass
class ProgressContext:
    attempts: list[Attempt]  # завершённые, по возрастанию времени
    mastery: dict[str, float]
    level_index: int
    streak_days: int
    published_scenarios: set[str]


def finished_attempts(db: Session, user_id: int) -> list[Attempt]:
    query = select(Attempt).where(Attempt.user_id == user_id, Attempt.status == "finished")
    return list(db.scalars(query.order_by(Attempt.finished_at)))


def streak_days(attempts: list[Attempt], now: datetime) -> int:
    """Сколько дней подряд (до сегодня или вчера включительно) были тренировки."""
    days = {(attempt.finished_at + MSK_OFFSET).date() for attempt in attempts}
    today: date = (now + MSK_OFFSET).date()
    day = today if today in days else today - timedelta(days=1)
    streak = 0
    while day in days:
        streak += 1
        day -= timedelta(days=1)
    return streak


def build_context(db: Session, user: User, now: datetime) -> ProgressContext:
    attempts = finished_attempts(db, user.id)
    return ProgressContext(
        attempts=attempts,
        mastery={code: row.mastery for code, row in mastery_map(db, user.id).items()},
        level_index=level_info(total_xp(db, user.id))["index"],
        streak_days=streak_days(attempts, now),
        published_scenarios={row.id for row in latest_rows(db)},
    )
