"""Время в приложении: в БД хранится «наивное» UTC-время (одинаково для SQLite и PostgreSQL),
в API отдаётся ISO-строка с явной зоной UTC."""

from datetime import UTC, datetime
from typing import Annotated

from pydantic import PlainSerializer


def utcnow() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


def iso_utc(value: datetime) -> str:
    return value.replace(tzinfo=UTC).isoformat()


UtcDatetime = Annotated[datetime, PlainSerializer(iso_utc, return_type=str)]
