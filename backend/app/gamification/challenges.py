"""Челленджи — задания с периодом действия и наградой в очках опыта (content/challenges.yaml)."""

from datetime import date, datetime, time, timedelta
from functools import lru_cache

from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.content import CONTENT_DIR, read_yaml
from app.gamification import points
from app.gamification.notifications import notify
from app.gamification.rules import AttemptFilter
from app.models import Attempt, User, UserChallenge


class ChallengeDef(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    title: str
    description: str
    starts: date
    ends: date  # включительно
    filter: AttemptFilter = Field(default_factory=AttemptFilter)
    min: int
    reward_xp: int

    @property
    def window(self) -> tuple[datetime, datetime]:
        return datetime.combine(self.starts, time.min), datetime.combine(self.ends + timedelta(days=1), time.min)

    def is_active(self, now: datetime) -> bool:
        start, end = self.window
        return start <= now < end

    def progress(self, attempts: list[Attempt]) -> int:
        start, end = self.window
        in_window = [a for a in attempts if start <= a.finished_at < end]
        return self.filter.count(in_window)


@lru_cache
def definitions() -> list[ChallengeDef]:
    return [ChallengeDef.model_validate(item) for item in read_yaml(CONTENT_DIR / "challenges.yaml")]


def active(now: datetime) -> list[ChallengeDef]:
    return [challenge for challenge in definitions() if challenge.is_active(now)]


def completed_ids(db: Session, user_id: int) -> dict[str, datetime]:
    rows = db.scalars(select(UserChallenge).where(UserChallenge.user_id == user_id))
    return {row.challenge_id: row.completed_at for row in rows}


def evaluate(db: Session, user: User, attempts: list[Attempt], now: datetime) -> list[ChallengeDef]:
    """Засчитывает выполненные активные челленджи: запись, награда очками опыта, уведомление."""
    done = completed_ids(db, user.id)
    completed = []
    for challenge in active(now):
        if challenge.id in done or challenge.progress(attempts) < challenge.min:
            continue
        db.add(UserChallenge(user_id=user.id, challenge_id=challenge.id, completed_at=now))
        points.grant(db, user.id, challenge.reward_xp, "challenge", challenge.id, at=now)
        notify(db, user.id, "challenge_completed", f"Челлендж выполнен: {challenge.title}",
               f"Награда: +{points.experience_text(challenge.reward_xp)}.", link="/", dedup_key=f"challenge-done:{challenge.id}")
        completed.append(challenge)
    return completed


def overview(db: Session, user: User, attempts: list[Attempt], now: datetime) -> list[dict]:
    done = completed_ids(db, user.id)
    return [
        {
            "id": challenge.id,
            "title": challenge.title,
            "description": challenge.description,
            "ends": challenge.ends.isoformat(),
            "progress": min(challenge.progress(attempts), challenge.min),
            "target": challenge.min,
            "reward_xp": challenge.reward_xp,
            "completed_at": done.get(challenge.id),
        }
        for challenge in active(now)
    ]
