"""Мастерство по компетенциям (0..100) — экспоненциальное сглаживание результатов попыток.

Свежие попытки весят больше старых: навык, который «подтянули», быстро перестаёт считаться слабым.
"""

from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.content import competencies
from app.models import UserCompetency

SMOOTHING = 0.5  # вес новой попытки
MASTERED_FROM = 75
WEAK_BELOW = 50


def status(mastery: float) -> str:
    if mastery >= MASTERED_FROM:
        return "mastered"
    if mastery < WEAK_BELOW:
        return "weak"
    return "developing"


def update_mastery(db: Session, user_id: int, results: dict[str, int], now: datetime) -> None:
    existing = {row.code: row for row in db.scalars(select(UserCompetency).where(UserCompetency.user_id == user_id))}
    for code, result in results.items():
        row = existing.get(code)
        if row is None:
            db.add(UserCompetency(user_id=user_id, code=code, mastery=result, samples=1, updated_at=now))
        else:
            row.mastery = round((1 - SMOOTHING) * row.mastery + SMOOTHING * result, 1)
            row.samples += 1
            row.updated_at = now


def mastery_map(db: Session, user_id: int) -> dict[str, UserCompetency]:
    return {row.code: row for row in db.scalars(select(UserCompetency).where(UserCompetency.user_id == user_id))}


def competency_overview(db: Session, user_id: int) -> list[dict]:
    """Все компетенции справочника; по непройденным mastery = None."""
    rows = mastery_map(db, user_id)
    overview = []
    for code, info in competencies().items():
        row = rows.get(code)
        overview.append({
            "code": code,
            "title": info["title"],
            "description": info["description"],
            "mastery": row.mastery if row else None,
            "samples": row.samples if row else 0,
            "status": status(row.mastery) if row else "untested",
        })
    return overview
