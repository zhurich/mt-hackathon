"""Подсчёт результата попытки: очки компетенций, очки опыта, результат по компетенциям, ролевая модель.

Все правила начисления — константы в этом файле (формулы — docs/SPEC.md, раздел 7).
"""

from dataclasses import dataclass, field

from app.engine.runtime import GameState
from app.engine.schema import Scenario

QUALITY_SCORE = {"best": 1.0, "good": 0.6, "poor": 0.2, "bad": 0.0}
TIMEOUT_SCORE = 0.0
POINTS_PER_DECISION = 10
OUTCOME_BONUS_PER_DIFFICULTY = {"success": 30, "partial": 15, "fail": 0}
FAST_BEST_ANSWER_BONUS = 2  # за лучший ответ быстрее половины таймера
ROLE_MODEL_STEPS = ("acknowledge", "rule", "solution", "assure")


@dataclass
class AttemptResult:
    outcome: str
    xp: int
    final_loyalty: int
    final_safety: int
    decisions: int
    best_decisions: int
    timeouts: int
    avg_reaction_ms: int
    competency_points: dict[str, int] = field(default_factory=dict)
    competency_results: dict[str, int] = field(default_factory=dict)  # 0..100
    role_model_covered: list[str] = field(default_factory=list)


def decision_score(record: dict) -> float:
    return TIMEOUT_SCORE if record["timed_out"] else QUALITY_SCORE[record["quality"]]


def score_attempt(scenario: Scenario, state: GameState) -> AttemptResult:
    path = state.path
    points: dict[str, int] = {}
    scores_by_competency: dict[str, list[float]] = {}
    speed_bonus = 0

    for record in path:
        score = decision_score(record)
        for code in record["competencies"]:
            points[code] = points.get(code, 0) + round(POINTS_PER_DECISION * score)
            scores_by_competency.setdefault(code, []).append(score)
        is_fast = record["timer"] and record["reaction_ms"] < record["timer"] * 1000 / 2
        if record["quality"] == "best" and is_fast:
            speed_bonus += FAST_BEST_ANSWER_BONUS

    outcome = state.outcome or "fail"
    xp = sum(points.values()) + OUTCOME_BONUS_PER_DIFFICULTY[outcome] * scenario.difficulty + speed_bonus

    covered = {step for record in path for step in record["role_model"]}
    reactions = [record["reaction_ms"] for record in path]
    return AttemptResult(
        outcome=outcome,
        xp=xp,
        final_loyalty=state.loyalty,
        final_safety=state.safety,
        decisions=len(path),
        best_decisions=sum(record["quality"] == "best" for record in path),
        timeouts=sum(record["timed_out"] for record in path),
        avg_reaction_ms=round(sum(reactions) / len(reactions)) if reactions else 0,
        competency_points=points,
        competency_results={
            code: round(100 * sum(values) / len(values)) for code, values in scores_by_competency.items()
        },
        role_model_covered=[step for step in ROLE_MODEL_STEPS if step in covered],
    )
