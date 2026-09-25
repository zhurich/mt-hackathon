"""Фильтр завершённых попыток — общий язык правил для достижений и челленджей."""

from pydantic import BaseModel, ConfigDict

from app.engine.schema import Outcome
from app.engine.scoring import ROLE_MODEL_STEPS
from app.models import Attempt


class AttemptFilter(BaseModel):
    model_config = ConfigDict(extra="forbid")

    outcome: Outcome | None = None
    category: str | list[str] | None = None
    perfect: bool = False  # все решения — лучшие
    role_model_full: bool = False  # использованы все шаги ролевой модели
    no_timeouts: bool = False
    min_safety: int | None = None
    min_loyalty: int | None = None
    max_avg_reaction_ms: int | None = None
    min_difficulty: int | None = None

    def matches(self, attempt: Attempt) -> bool:
        categories = [self.category] if isinstance(self.category, str) else self.category
        checks = [
            self.outcome is None or attempt.outcome == self.outcome,
            categories is None or attempt.category in categories,
            not self.perfect or attempt.best_decisions == attempt.decisions,
            not self.role_model_full or attempt.role_model_steps == len(ROLE_MODEL_STEPS),
            not self.no_timeouts or attempt.timeouts == 0,
            self.min_safety is None or (attempt.final_safety or 0) >= self.min_safety,
            self.min_loyalty is None or (attempt.final_loyalty or 0) >= self.min_loyalty,
            self.max_avg_reaction_ms is None or attempt.avg_reaction_ms <= self.max_avg_reaction_ms,
            self.min_difficulty is None or attempt.difficulty >= self.min_difficulty,
        ]
        return all(checks)

    def count(self, attempts: list[Attempt]) -> int:
        return sum(self.matches(attempt) for attempt in attempts)
