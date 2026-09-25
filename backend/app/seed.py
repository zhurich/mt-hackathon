"""Демо-данные: синтетическая оргструктура, сотрудники и история прохождений.

История не выдумывается «цифрами»: для каждого сотрудника сценарии реально проигрываются
движком (с учётом его «навыка»), а результаты проходят обычный конвейер начисления очков.
Поэтому рейтинг, достижения и аналитика в демо согласованы между собой.
"""

import logging
import random
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.content import CONTENT_DIR, read_yaml
from app.engine import runtime
from app.engine.schema import ChoiceNode, Scenario
from app.engine.scoring import QUALITY_SCORE
from app.gamification.progress import finish_attempt
from app.models import ApiKey, Attempt, OrgUnit, User
from app.scenario_store import latest_scenarios
from app.security import hash_api_key, hash_password
from app.services import log_decision
from app.timeutil import utcnow

log = logging.getLogger("vsm")
RANDOM_SEED = 2026
HISTORY_DAYS = 40


def _pick(rng: random.Random, node: ChoiceNode, choices, skill: float):
    """Поведение симулируемого сотрудника: чем выше skill, тем чаще лучший вариант и реже таймаут."""
    if node.timer and rng.random() < (1 - skill) * 0.25:
        return None
    ranked = sorted(choices, key=lambda c: QUALITY_SCORE[c.quality], reverse=True)
    if rng.random() < skill or len(ranked) == 1:
        return ranked[0]
    return rng.choice(ranked[1:])


def simulate_attempt(db: Session, rng: random.Random, user: User, scenario: Scenario, skill: float,
                     started: datetime) -> None:
    clock = started.replace(tzinfo=UTC).timestamp()
    state = runtime.start(scenario, now=clock)
    attempt = Attempt(user_id=user.id, scenario_id=scenario.id, scenario_version=scenario.version,
                      category=scenario.category, difficulty=scenario.difficulty,
                      state=state.to_dict(), started_at=started)
    db.add(attempt)
    db.flush()

    while not state.finished:
        node = scenario.choice_node(state.node_id)
        choice = _pick(rng, node, runtime.available_choices(scenario, state), skill)
        limit = node.timer or 40
        clock += limit + 1 if choice is None else rng.uniform(0.25, 0.9) * limit * (1.15 - skill * 0.5)
        record = runtime.decide(scenario, state, choice.id if choice else None, now=clock,
                                client_timeout=choice is None)
        log_decision(db, attempt, scenario, record, at=datetime.fromtimestamp(clock, UTC).replace(tzinfo=None))

    attempt.state = state.to_dict()
    finished = datetime.fromtimestamp(clock, UTC).replace(tzinfo=None)
    rewards = finish_attempt(db, user, attempt, scenario, state, finished)
    attempt.result = {**attempt.result, "rewards": rewards}
    db.flush()


def seed_demo(db: Session) -> None:
    if db.scalar(select(User.id).limit(1)):
        return
    settings = get_settings()
    org = read_yaml(CONTENT_DIR / "demo_org.yaml")
    password = hash_password(settings.demo_password)

    brigades: dict[str, OrgUnit] = {}
    for depot_data in org["depots"]:
        depot = OrgUnit(name=depot_data["name"], kind="depot")
        db.add(depot)
        db.flush()
        for name in depot_data["brigades"]:
            brigades[name] = OrgUnit(name=name, kind="brigade", parent_id=depot.id)
            db.add(brigades[name])
    db.flush()

    for trainer in org["trainers"]:
        db.add(User(role="trainer", password_hash=password, **trainer))

    now = utcnow()
    rng = random.Random(RANDOM_SEED)
    scenarios = latest_scenarios(db)
    for data in org["conductors"]:
        user = User(login=data["login"], display_name=data["display_name"], employee_code=data["employee_code"],
                    brigade_id=brigades[data["brigade"]].id, role="conductor", password_hash=password,
                    created_at=now)
        db.add(user)
        db.flush()
        days = data.get("days_ago") or [rng.uniform(0, HISTORY_DAYS) for _ in range(data.get("history", 0))]
        for days_ago in sorted(days, reverse=True):
            started = now - timedelta(days=days_ago, minutes=rng.randint(0, 600))
            simulate_attempt(db, rng, user, rng.choice(scenarios), data["skill"], started)

    db.add(ApiKey(name="Демо-интеграция HR/LMS", key_hash=hash_api_key(settings.demo_integration_key)))
    db.commit()
    log.info("Demo data seeded: %d conductors", len(org["conductors"]))
