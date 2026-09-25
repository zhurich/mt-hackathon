"""Аналитика для тренера: бригады, сотрудники, самые сложные решения."""

from collections import defaultdict
from datetime import datetime

from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from app.analytics.competencies import WEAK_BELOW
from app.content import competencies
from app.engine.schema import ChoiceNode
from app.gamification.levels import level_info
from app.gamification.points import points_cutoff
from app.models import Attempt, AttemptEvent, OrgUnit, User, UserCompetency, XpGrant
from app.scenario_store import get_scenario

HARDEST_MIN_ANSWERS = 3


def _brigades(db: Session, mastery_rows: list[UserCompetency], users: list[User]) -> list[dict]:
    by_user = defaultdict(dict)
    for row in mastery_rows:
        by_user[row.user_id][row.code] = row.mastery

    result = []
    for brigade in db.scalars(select(OrgUnit).where(OrgUnit.kind == "brigade").order_by(OrgUnit.name)):
        members = [user for user in users if user.brigade_id == brigade.id]
        averages = {}
        for code in competencies():
            values = [by_user[user.id][code] for user in members if code in by_user[user.id]]
            averages[code] = round(sum(values) / len(values)) if values else None
        result.append({
            "id": brigade.id,
            "name": brigade.name,
            "depot": brigade.parent.name if brigade.parent else None,
            "members": len(members),
            "competencies": averages,
        })
    return result


def _employees(db: Session, mastery_rows: list[UserCompetency], users: list[User], now: datetime) -> list[dict]:
    attempts = dict(db.execute(
        select(Attempt.user_id, func.count()).where(Attempt.status == "finished").group_by(Attempt.user_id)
    ).all())
    successes = dict(db.execute(
        select(Attempt.user_id, func.count())
        .where(Attempt.status == "finished", Attempt.outcome == "success")
        .group_by(Attempt.user_id)
    ).all())
    total_xp = dict(db.execute(select(XpGrant.user_id, func.sum(XpGrant.amount)).group_by(XpGrant.user_id)).all())
    active = dict(db.execute(
        select(XpGrant.user_id, func.sum(XpGrant.amount))
        .where(XpGrant.created_at >= points_cutoff(now))
        .group_by(XpGrant.user_id)
    ).all())

    weakest: dict[int, UserCompetency] = {}
    for row in mastery_rows:
        if row.user_id not in weakest or row.mastery < weakest[row.user_id].mastery:
            weakest[row.user_id] = row

    titles = {code: info["title"] for code, info in competencies().items()}
    employees = []
    for user in users:
        count = attempts.get(user.id, 0)
        weak = weakest.get(user.id)
        employees.append({
            "user_id": user.id,
            "display_name": user.display_name,
            "employee_code": user.employee_code,
            "brigade": user.brigade.name if user.brigade else None,
            "attempts": count,
            "success_rate": round(successes.get(user.id, 0) / count, 3) if count else 0.0,
            "level_title": level_info(total_xp.get(user.id, 0))["title"],
            "active_points": active.get(user.id, 0),
            "weakest": {"code": weak.code, "title": titles[weak.code], "mastery": round(weak.mastery)}
            if weak and weak.mastery < WEAK_BELOW else None,
        })
    employees.sort(key=lambda item: item["active_points"], reverse=True)
    return employees


def _hardest_decisions(db: Session, limit: int = 5) -> list[dict]:
    failed = case((AttemptEvent.timed_out | AttemptEvent.quality.in_(["bad", "poor"]), 1), else_=0)
    rows = db.execute(
        select(
            AttemptEvent.scenario_id,
            AttemptEvent.node_id,
            func.max(AttemptEvent.scenario_version),
            func.count(),
            func.sum(failed),
            func.sum(case((AttemptEvent.timed_out, 1), else_=0)),
        )
        .group_by(AttemptEvent.scenario_id, AttemptEvent.node_id)
        .having(func.count() >= HARDEST_MIN_ANSWERS)
    ).all()

    items = []
    for scenario_id, node_id, version, total, failed_count, timeouts in rows:
        scenario = get_scenario(db, scenario_id, version)
        node = scenario.nodes.get(node_id)
        if not isinstance(node, ChoiceNode):
            continue
        items.append({
            "scenario_id": scenario_id,
            "scenario_title": scenario.title,
            "node_id": node_id,
            "situation": node.text,
            "answers": total,
            "error_rate": round(failed_count / total, 3),
            "timeout_rate": round(timeouts / total, 3),
        })
    items.sort(key=lambda item: item["error_rate"], reverse=True)
    return items[:limit]


def team_analytics(db: Session, now: datetime) -> dict:
    users = list(db.scalars(select(User).where(User.role == "conductor").order_by(User.display_name)))
    mastery_rows = list(db.scalars(select(UserCompetency)))
    company = {}
    for code in competencies():
        values = [row.mastery for row in mastery_rows if row.code == code]
        company[code] = round(sum(values) / len(values)) if values else None
    return {
        "competency_titles": {code: info["title"] for code, info in competencies().items()},
        "company": company,
        "brigades": _brigades(db, mastery_rows, users),
        "employees": _employees(db, mastery_rows, users, now),
        "hardest_decisions": _hardest_decisions(db),
    }
