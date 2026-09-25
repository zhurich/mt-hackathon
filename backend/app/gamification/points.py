"""XP и баллы рейтинга.

Каждое начисление — строка xp_grants. Сумма всех начислений определяет уровень (не сгорает),
начисления за последние POINTS_TTL_DAYS дней — «активные баллы» для рейтинга (сгорают).
"""

from datetime import datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import XpGrant
from app.timeutil import utcnow


def grant(db: Session, user_id: int, amount: int, reason: str, ref: str, at: datetime | None = None) -> None:
    if amount > 0:
        db.add(XpGrant(user_id=user_id, amount=amount, reason=reason, ref=ref, created_at=at or utcnow()))


def total_xp(db: Session, user_id: int) -> int:
    return db.scalar(select(func.coalesce(func.sum(XpGrant.amount), 0)).where(XpGrant.user_id == user_id))


def points_cutoff(now: datetime) -> datetime:
    return now - timedelta(days=get_settings().points_ttl_days)


def active_points(db: Session, user_id: int, now: datetime) -> int:
    query = select(func.coalesce(func.sum(XpGrant.amount), 0)).where(
        XpGrant.user_id == user_id, XpGrant.created_at >= points_cutoff(now)
    )
    return db.scalar(query)


def expiring_soon(db: Session, user_id: int, now: datetime) -> dict | None:
    """Баллы, которые сгорят в ближайшие N дней, и дата первого сгорания."""
    settings = get_settings()
    window_start = points_cutoff(now)
    window_end = window_start + timedelta(days=settings.points_expiry_warning_days)
    row = db.execute(
        select(func.sum(XpGrant.amount), func.min(XpGrant.created_at)).where(
            XpGrant.user_id == user_id, XpGrant.created_at >= window_start, XpGrant.created_at < window_end
        )
    ).one()
    points, earliest = row
    if not points:
        return None
    return {"points": points, "expires_at": earliest + timedelta(days=settings.points_ttl_days)}
