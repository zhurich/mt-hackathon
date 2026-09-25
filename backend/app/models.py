"""Модель данных (SQLAlchemy). Описание таблиц — docs/SPEC.md, раздел 11.

Персональные данные сведены к минимуму: у сотрудника есть логин, псевдоним и табельный код,
данных пассажиров в системе нет вообще.
"""

from datetime import datetime
from typing import Any

from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base
from app.timeutil import utcnow


class OrgUnit(Base):
    """Депо (kind=depot) или бригада (kind=brigade, parent — депо)."""

    __tablename__ = "org_units"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    kind: Mapped[str] = mapped_column(String(16))
    parent_id: Mapped[int | None] = mapped_column(ForeignKey("org_units.id"))

    parent: Mapped["OrgUnit | None"] = relationship(remote_side=[id])


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    login: Mapped[str] = mapped_column(String(64), unique=True)
    password_hash: Mapped[str | None] = mapped_column(String(200))
    display_name: Mapped[str] = mapped_column(String(80))
    employee_code: Mapped[str] = mapped_column(String(32), unique=True)
    role: Mapped[str] = mapped_column(String(16), default="conductor")  # conductor | trainer
    brigade_id: Mapped[int | None] = mapped_column(ForeignKey("org_units.id"))
    external_id: Mapped[str | None] = mapped_column(String(64), unique=True)  # id в HR-системе
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    brigade: Mapped[OrgUnit | None] = relationship()

    @property
    def depot(self) -> OrgUnit | None:
        return self.brigade.parent if self.brigade else None


class ScenarioVersion(Base):
    """Каждая версия сценария хранится отдельно: незавершённые попытки и старые разборы
    продолжают работать на той версии, с которой начинались."""

    __tablename__ = "scenario_versions"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    version: Mapped[int] = mapped_column(Integer, primary_key=True)
    title: Mapped[str] = mapped_column(String(200))
    category: Mapped[str] = mapped_column(String(32))
    data: Mapped[dict[str, Any]] = mapped_column(JSON)
    published_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class Attempt(Base):
    __tablename__ = "attempts"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    scenario_id: Mapped[str] = mapped_column(String(64), index=True)
    scenario_version: Mapped[int] = mapped_column(Integer)
    category: Mapped[str] = mapped_column(String(32))
    difficulty: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(16), default="active")  # active | finished | abandoned
    state: Mapped[dict[str, Any]] = mapped_column(JSON)
    started_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime, index=True)

    # Итоги (заполняются по завершении) — отдельными колонками для быстрых выборок.
    outcome: Mapped[str | None] = mapped_column(String(16))
    xp: Mapped[int] = mapped_column(Integer, default=0)
    final_loyalty: Mapped[int | None] = mapped_column(Integer)
    final_safety: Mapped[int | None] = mapped_column(Integer)
    decisions: Mapped[int] = mapped_column(Integer, default=0)
    best_decisions: Mapped[int] = mapped_column(Integer, default=0)
    timeouts: Mapped[int] = mapped_column(Integer, default=0)
    avg_reaction_ms: Mapped[int] = mapped_column(Integer, default=0)
    role_model_steps: Mapped[int] = mapped_column(Integer, default=0)
    result: Mapped[dict[str, Any] | None] = mapped_column(JSON)


class AttemptEvent(Base):
    """Журнал решений — сырые данные для аналитики и выгрузки в LMS."""

    __tablename__ = "attempt_events"

    id: Mapped[int] = mapped_column(primary_key=True)
    attempt_id: Mapped[int] = mapped_column(ForeignKey("attempts.id"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    scenario_id: Mapped[str] = mapped_column(String(64))
    scenario_version: Mapped[int] = mapped_column(Integer)
    node_id: Mapped[str] = mapped_column(String(64))
    choice_id: Mapped[str | None] = mapped_column(String(64))
    quality: Mapped[str | None] = mapped_column(String(8))
    timed_out: Mapped[bool] = mapped_column(Boolean, default=False)
    reaction_ms: Mapped[int] = mapped_column(Integer)
    delta_loyalty: Mapped[int] = mapped_column(Integer)
    delta_safety: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)


class XpGrant(Base):
    """Начисление XP. Сумма всех начислений — уровень; начисления за последние N дней — рейтинг."""

    __tablename__ = "xp_grants"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    amount: Mapped[int] = mapped_column(Integer)
    reason: Mapped[str] = mapped_column(String(32))  # attempt | challenge
    ref: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)


class UserCompetency(Base):
    __tablename__ = "user_competencies"

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), primary_key=True)
    code: Mapped[str] = mapped_column(String(32), primary_key=True)
    mastery: Mapped[float] = mapped_column(Float)
    samples: Mapped[int] = mapped_column(Integer, default=0)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class UserAchievement(Base):
    __tablename__ = "user_achievements"

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), primary_key=True)
    code: Mapped[str] = mapped_column(String(64), primary_key=True)
    earned_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class UserChallenge(Base):
    __tablename__ = "user_challenges"

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), primary_key=True)
    challenge_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    completed_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class Notification(Base):
    __tablename__ = "notifications"
    __table_args__ = (UniqueConstraint("user_id", "dedup_key"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    kind: Mapped[str] = mapped_column(String(32))
    title: Mapped[str] = mapped_column(String(200))
    body: Mapped[str] = mapped_column(Text)
    link: Mapped[str | None] = mapped_column(String(200))
    dedup_key: Mapped[str | None] = mapped_column(String(128))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)
    read_at: Mapped[datetime | None] = mapped_column(DateTime)


class ApiKey(Base):
    """Ключ доступа внешней системы (HR/LMS). Хранится только SHA-256 хэш."""

    __tablename__ = "api_keys"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(80))
    key_hash: Mapped[str] = mapped_column(String(64), unique=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
