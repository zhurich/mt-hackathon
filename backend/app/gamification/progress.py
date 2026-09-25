"""Замыкание цикла «действие → очки → достижения → рейтинг → уведомления» при завершении попытки."""

from dataclasses import asdict
from datetime import datetime

from sqlalchemy.orm import Session

from app.analytics.competencies import update_mastery
from app.engine.runtime import GameState
from app.engine.schema import Scenario
from app.engine.scoring import AttemptResult, score_attempt
from app.gamification import achievements, challenges, points
from app.gamification.context import build_context
from app.gamification.levels import level_info
from app.gamification.notifications import notify
from app.models import Attempt, User


def _store_result(attempt: Attempt, result: AttemptResult, now: datetime) -> None:
    attempt.status = "finished"
    attempt.finished_at = now
    attempt.outcome = result.outcome
    attempt.xp = result.xp
    attempt.final_loyalty = result.final_loyalty
    attempt.final_safety = result.final_safety
    attempt.decisions = result.decisions
    attempt.best_decisions = result.best_decisions
    attempt.timeouts = result.timeouts
    attempt.avg_reaction_ms = result.avg_reaction_ms
    attempt.role_model_steps = len(result.role_model_covered)
    attempt.result = asdict(result)


def finish_attempt(
    db: Session, user: User, attempt: Attempt, scenario: Scenario, state: GameState, now: datetime
) -> dict:
    """Подсчитывает итоги, начисляет XP, обновляет мастерство, выдаёт достижения и челленджи."""
    level_before = level_info(points.total_xp(db, user.id))

    result = score_attempt(scenario, state)
    _store_result(attempt, result, now)
    points.grant(db, user.id, result.xp, "attempt", str(attempt.id), at=now)
    update_mastery(db, user.id, result.competency_results, now)
    db.flush()

    ctx = build_context(db, user, now)
    completed_challenges = challenges.evaluate(db, user, ctx.attempts, now)
    db.flush()
    level_after = level_info(points.total_xp(db, user.id))
    ctx.level_index = level_after["index"]
    new_achievements = achievements.evaluate(db, user, ctx, now)

    for definition in new_achievements:
        notify(db, user.id, "achievement", f"Новое достижение: {definition.title}", definition.description,
               link="/profile", dedup_key=f"achievement:{definition.code}", at=now)
    level_up = level_after["index"] > level_before["index"]
    if level_up:
        notify(db, user.id, "level_up", f"Новый уровень: {level_after['title']}",
               "Поздравляем! Продолжайте тренироваться, чтобы расти дальше.",
               link="/profile", dedup_key=f"level:{level_after['index']}", at=now)

    return {
        "xp": result.xp,
        "level": level_after,
        "level_up": level_up,
        "new_achievements": [
            {"code": d.code, "title": d.title, "description": d.description, "icon": d.icon}
            for d in new_achievements
        ],
        "completed_challenges": [
            {"id": c.id, "title": c.title, "reward_xp": c.reward_xp} for c in completed_challenges
        ],
    }
