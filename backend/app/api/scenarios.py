from typing import Any

import yaml
from fastapi import APIRouter, status
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.analytics.insights import CATEGORY_TITLES
from app.api.deps import CurrentUser, Db, TrainerUser
from app.engine.schema import ChoiceNode, Scenario, ScenarioError
from app.errors import AppError
from app.models import Attempt
from app.scenario_store import get_scenario, latest_scenarios, parse_uploaded, publish

router = APIRouter(prefix="/scenarios", tags=["Сценарии"])

SERVICE_CLASS_TITLES = {"standard": "Стандарт", "comfort": "Комфорт", "business": "Бизнес", "first": "Первый"}
OUTCOME_RANK = {"fail": 0, "partial": 1, "success": 2}


class ScenarioSummary(BaseModel):
    id: str
    version: int
    title: str
    summary: str
    category: str
    category_title: str
    difficulty: int
    service_class: str
    service_class_title: str
    competencies: list[str]
    decisions: int
    has_timer: bool
    my_attempts: int = 0
    my_best_outcome: str | None = None
    active_attempt_id: int | None = None


class ScenarioDetail(ScenarioSummary):
    briefing: str
    sources: list[str]
    initial_loyalty: int
    initial_safety: int
    hud: dict[str, str]


class ScenarioUpload(BaseModel):
    content: str = Field(min_length=1, max_length=200_000, description="Текст сценария в формате YAML или JSON")


class ValidationResult(BaseModel):
    valid: bool
    errors: list[str] = []
    scenario: ScenarioSummary | None = None


def summarize(scenario: Scenario) -> dict[str, Any]:
    return {
        "id": scenario.id,
        "version": scenario.version,
        "title": scenario.title,
        "summary": scenario.summary,
        "category": scenario.category,
        "category_title": CATEGORY_TITLES[scenario.category],
        "difficulty": scenario.difficulty,
        "service_class": scenario.service_class,
        "service_class_title": SERVICE_CLASS_TITLES[scenario.service_class],
        "competencies": scenario.competencies,
        "decisions": scenario.decision_nodes,
        "has_timer": any(isinstance(n, ChoiceNode) and n.timer for n in scenario.nodes.values()),
    }


def _my_stats(db: Db, user_id: int) -> dict[str, dict[str, Any]]:
    stats: dict[str, dict[str, Any]] = {}
    for attempt in db.scalars(select(Attempt).where(Attempt.user_id == user_id, Attempt.status != "abandoned")):
        item = stats.setdefault(attempt.scenario_id, {"my_attempts": 0, "my_best_outcome": None, "active_attempt_id": None})
        if attempt.status == "active":
            item["active_attempt_id"] = attempt.id
            continue
        item["my_attempts"] += 1
        best = item["my_best_outcome"]
        if best is None or OUTCOME_RANK[attempt.outcome] > OUTCOME_RANK[best]:
            item["my_best_outcome"] = attempt.outcome
    return stats


@router.get("", response_model=list[ScenarioSummary], summary="Каталог опубликованных сценариев")
def list_scenarios(db: Db, user: CurrentUser) -> list[ScenarioSummary]:
    stats = _my_stats(db, user.id)
    return [ScenarioSummary(**summarize(s), **stats.get(s.id, {})) for s in latest_scenarios(db)]


@router.get("/{scenario_id}", response_model=ScenarioDetail, summary="Описание сценария (без графа решений)")
def scenario_detail(scenario_id: str, db: Db, user: CurrentUser) -> ScenarioDetail:
    scenario = get_scenario(db, scenario_id)
    return ScenarioDetail(
        **summarize(scenario),
        **_my_stats(db, user.id).get(scenario.id, {}),
        briefing=scenario.briefing,
        sources=scenario.sources,
        initial_loyalty=scenario.initial.loyalty,
        initial_safety=scenario.initial.safety,
        hud=scenario.hud,
    )


@router.get("/{scenario_id}/graph", summary="Полный граф сценария (тренер)")
def scenario_graph(scenario_id: str, db: Db, _: TrainerUser, version: int | None = None) -> dict[str, Any]:
    return get_scenario(db, scenario_id, version).model_dump(mode="json", by_alias=True)


def _parse_content(content: str) -> Scenario:
    try:
        data = yaml.safe_load(content)
    except yaml.YAMLError as exc:
        raise AppError(422, "invalid_yaml", f"Не удалось разобрать YAML/JSON: {exc}") from None
    return parse_uploaded(data)


@router.post("/validate", response_model=ValidationResult, summary="Проверить сценарий без публикации (тренер)")
def validate_scenario(body: ScenarioUpload, _: TrainerUser) -> ValidationResult:
    try:
        scenario = _parse_content(body.content)
    except ScenarioError as exc:
        return ValidationResult(valid=False, errors=exc.errors)
    return ValidationResult(valid=True, scenario=ScenarioSummary(**summarize(scenario)))


@router.post("", response_model=ScenarioSummary, status_code=status.HTTP_201_CREATED,
             summary="Опубликовать новый сценарий или новую версию (тренер)")
def upload_scenario(body: ScenarioUpload, db: Db, _: TrainerUser) -> ScenarioSummary:
    scenario = _parse_content(body.content)
    publish(db, scenario)
    return ScenarioSummary(**summarize(scenario))
