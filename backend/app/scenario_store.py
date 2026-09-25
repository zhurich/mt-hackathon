"""Хранилище сценариев: версии в БД + кеш разобранных сценариев в памяти процесса.

Источник сценариев — YAML-файлы (синхронизируются при старте) или загрузка через API.
Кеш неизменяем по ключу (id, version), поэтому безопасен при нескольких экземплярах backend.
"""

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.content import competencies, parse_scenario_file, scenario_files
from app.engine.schema import Scenario, load_scenario
from app.errors import AppError
from app.models import ScenarioVersion

_cache: dict[tuple[str, int], Scenario] = {}


def _to_scenario(row: ScenarioVersion) -> Scenario:
    key = (row.id, row.version)
    if key not in _cache:
        _cache[key] = Scenario.model_validate(row.data)
    return _cache[key]


def get_scenario(db: Session, scenario_id: str, version: int | None = None) -> Scenario:
    query = select(ScenarioVersion).where(ScenarioVersion.id == scenario_id)
    if version is None:
        query = query.order_by(ScenarioVersion.version.desc()).limit(1)
    else:
        query = query.where(ScenarioVersion.version == version)
    row = db.scalars(query).first()
    if row is None:
        raise AppError(404, "scenario_not_found", f"Сценарий '{scenario_id}' не найден")
    return _to_scenario(row)


def latest_rows(db: Session) -> list[ScenarioVersion]:
    latest = (
        select(ScenarioVersion.id, func.max(ScenarioVersion.version).label("version"))
        .group_by(ScenarioVersion.id)
        .subquery()
    )
    query = select(ScenarioVersion).join(
        latest, (ScenarioVersion.id == latest.c.id) & (ScenarioVersion.version == latest.c.version)
    )
    return list(db.scalars(query.order_by(ScenarioVersion.published_at, ScenarioVersion.id)))


def latest_scenarios(db: Session) -> list[Scenario]:
    return [_to_scenario(row) for row in latest_rows(db)]


def current_version(db: Session, scenario_id: str) -> int | None:
    return db.scalar(select(func.max(ScenarioVersion.version)).where(ScenarioVersion.id == scenario_id))


def publish(db: Session, scenario: Scenario) -> ScenarioVersion:
    current = current_version(db, scenario.id)
    if current is not None and scenario.version <= current:
        raise AppError(409, "version_conflict", f"Версия должна быть больше текущей ({current})")
    row = ScenarioVersion(
        id=scenario.id,
        version=scenario.version,
        title=scenario.title,
        category=scenario.category,
        data=scenario.model_dump(mode="json", by_alias=True),
    )
    db.add(row)
    db.commit()
    return row


def parse_uploaded(data: object) -> Scenario:
    if not isinstance(data, dict):
        raise AppError(422, "invalid_scenario", "Сценарий должен быть объектом YAML/JSON")
    return load_scenario(data, set(competencies()))


def sync_from_files(db: Session) -> list[str]:
    """Публикует сценарии из content/scenarios, версия которых новее, чем в БД."""
    published = []
    for path in scenario_files():
        scenario = parse_scenario_file(path)
        current = current_version(db, scenario.id)
        if current is None or scenario.version > current:
            publish(db, scenario)
            published.append(scenario.id)
    return published
