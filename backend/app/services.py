"""Операции над попытками, общие для API и генератора демо-данных."""

from datetime import datetime

from sqlalchemy.orm import Session

from app.engine.schema import Scenario
from app.models import Attempt, AttemptEvent
from app.timeutil import utcnow


def log_decision(db: Session, attempt: Attempt, scenario: Scenario, record: dict, at: datetime | None = None) -> None:
    db.add(AttemptEvent(
        attempt_id=attempt.id,
        user_id=attempt.user_id,
        scenario_id=scenario.id,
        scenario_version=scenario.version,
        node_id=record["node_id"],
        choice_id=record["choice_id"],
        quality=record["quality"],
        timed_out=record["timed_out"],
        reaction_ms=record["reaction_ms"],
        delta_loyalty=record["delta"]["loyalty"],
        delta_safety=record["delta"]["safety"],
        created_at=at or utcnow(),
    ))
