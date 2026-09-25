"""Рейтинг проводников по активным (несгоревшим) баллам: бригада, депо или вся компания."""

from datetime import datetime
from typing import Literal

from sqlalchemy import func, select
from sqlalchemy.orm import Session, aliased

from app.gamification.levels import level_info
from app.gamification.points import points_cutoff
from app.models import OrgUnit, User, XpGrant

Scope = Literal["brigade", "depot", "company"]


def leaderboard(db: Session, me: User, scope: Scope, now: datetime, limit: int = 50) -> dict:
    active = (
        select(XpGrant.user_id, func.sum(XpGrant.amount).label("points"))
        .where(XpGrant.created_at >= points_cutoff(now))
        .group_by(XpGrant.user_id)
        .subquery()
    )
    total = select(XpGrant.user_id, func.sum(XpGrant.amount).label("xp")).group_by(XpGrant.user_id).subquery()
    brigade = aliased(OrgUnit)

    query = (
        select(User, brigade.name, func.coalesce(active.c.points, 0), func.coalesce(total.c.xp, 0))
        .outerjoin(brigade, User.brigade_id == brigade.id)
        .outerjoin(active, active.c.user_id == User.id)
        .outerjoin(total, total.c.user_id == User.id)
        .where(User.role == "conductor")
    )
    scope_name = "Компания"
    if scope == "brigade":
        query = query.where(User.brigade_id == me.brigade_id)
        scope_name = me.brigade.name if me.brigade else "—"
    elif scope == "depot":
        depot = me.depot
        query = query.where(brigade.parent_id == (depot.id if depot else None))
        scope_name = depot.name if depot else "—"

    rows = db.execute(query.order_by(func.coalesce(active.c.points, 0).desc(), User.display_name)).all()
    entries = [
        {
            "rank": rank,
            "user_id": user.id,
            "display_name": user.display_name,
            "brigade": brigade_name,
            "points": points,
            "total_xp": xp,
            "level_title": level_info(xp)["title"],
            "is_me": user.id == me.id,
        }
        for rank, (user, brigade_name, points, xp) in enumerate(rows, start=1)
    ]
    my_entry = next((entry for entry in entries if entry["is_me"]), None)
    return {"scope": scope, "scope_name": scope_name, "entries": entries[:limit], "me": my_entry}
