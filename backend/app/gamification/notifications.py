"""Уведомления. Создаются по событиям (достижение, уровень, челлендж) и «лениво» при запросе
списка (новые сценарии, новые челленджи, сгорающие баллы). Повторы исключает dedup_key."""

from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Notification, User
from app.scenario_store import latest_rows


def notify(
    db: Session,
    user_id: int,
    kind: str,
    title: str,
    body: str,
    link: str | None = None,
    dedup_key: str | None = None,
    at: datetime | None = None,
) -> bool:
    if dedup_key:
        exists = db.scalar(
            select(Notification.id).where(Notification.user_id == user_id, Notification.dedup_key == dedup_key)
        )
        if exists:
            return False
    notification = Notification(user_id=user_id, kind=kind, title=title, body=body, link=link, dedup_key=dedup_key)
    if at:
        notification.created_at = at
    db.add(notification)
    return True


def refresh(db: Session, user: User, now: datetime) -> None:
    """Проверяет события, о которых пользователь ещё не уведомлён."""
    # Импорты внутри функции: challenges и points сами используют notify.
    from app.gamification import challenges, points

    for row in latest_rows(db):
        if row.published_at > user.created_at:
            notify(db, user.id, "new_scenario", f"Новый сценарий: {row.title}",
                   "Проверьте себя в новой ситуации и заработайте очки компетенций.",
                   link=f"/scenarios/{row.id}", dedup_key=f"scenario:{row.id}")

    for challenge in challenges.active(now):
        notify(db, user.id, "new_challenge", f"Челлендж: {challenge.title}",
               f"{challenge.description} Награда: +{challenge.reward_xp} XP до {challenge.ends:%d.%m}.",
               link="/", dedup_key=f"challenge:{challenge.id}")

    expiring = points.expiring_soon(db, user.id, now)
    if expiring:
        expires = expiring["expires_at"]
        notify(db, user.id, "points_expiring", f"Сгорают баллы: {expiring['points']}",
               f"{expires:%d.%m} часть баллов рейтинга сгорит. Пройдите сценарий, чтобы удержать позицию.",
               link="/leaderboard", dedup_key=f"expiring:{expires:%Y-%m-%d}")
