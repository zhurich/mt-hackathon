"""Достижения: определения — content/achievements.yaml, типы правил — здесь.

Чтобы добавить новый ТИП правила: дописать ветку в `progress` и значение в `Rule.type`.
"""

from datetime import datetime
from functools import lru_cache
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.content import CONTENT_DIR, read_yaml
from app.gamification.context import ProgressContext
from app.gamification.rules import AttemptFilter
from app.models import User, UserAchievement


class Rule(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: Literal["attempts", "competency", "level", "streak", "all_scenarios"]
    min: int = 1
    filter: AttemptFilter = Field(default_factory=AttemptFilter)
    code: str | None = None  # для type=competency
    days: int | None = None  # для type=streak


class AchievementDef(BaseModel):
    model_config = ConfigDict(extra="forbid")

    code: str
    title: str
    description: str
    icon: str
    rule: Rule


@lru_cache
def definitions() -> list[AchievementDef]:
    return [AchievementDef.model_validate(item) for item in read_yaml(CONTENT_DIR / "achievements.yaml")]


def progress(rule: Rule, ctx: ProgressContext) -> tuple[int, int]:
    """(текущее значение, цель) — для проверки и для прогресс-бара в профиле."""
    match rule.type:
        case "attempts":
            return rule.filter.count(ctx.attempts), rule.min
        case "competency":
            return round(ctx.mastery.get(rule.code, 0)), rule.min
        case "level":
            return ctx.level_index, rule.min
        case "streak":
            return ctx.streak_days, rule.days or 1
        case "all_scenarios":
            succeeded = {a.scenario_id for a in ctx.attempts if a.outcome == "success"}
            return len(succeeded & ctx.published_scenarios), len(ctx.published_scenarios)


def earned_codes(db: Session, user_id: int) -> dict[str, datetime]:
    rows = db.scalars(select(UserAchievement).where(UserAchievement.user_id == user_id))
    return {row.code: row.earned_at for row in rows}


def evaluate(db: Session, user: User, ctx: ProgressContext, now: datetime) -> list[AchievementDef]:
    """Выдаёт все достижения, условия которых выполнены, и возвращает новые."""
    earned = earned_codes(db, user.id)
    new = []
    for definition in definitions():
        if definition.code in earned:
            continue
        current, target = progress(definition.rule, ctx)
        if target > 0 and current >= target:
            db.add(UserAchievement(user_id=user.id, code=definition.code, earned_at=now))
            new.append(definition)
    return new


def overview(db: Session, user: User, ctx: ProgressContext) -> list[dict]:
    earned = earned_codes(db, user.id)
    items = []
    for definition in definitions():
        current, target = progress(definition.rule, ctx)
        items.append({
            "code": definition.code,
            "title": definition.title,
            "description": definition.description,
            "icon": definition.icon,
            "earned_at": earned.get(definition.code),
            "progress": min(current, target),
            "target": target,
        })
    return items
