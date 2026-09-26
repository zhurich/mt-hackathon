"""API визуального редактора сценариев (только тренер).

Редактор работает с черновиком на клиенте и использует сервер как «компилятор»:
разбор YAML, проверка с привязкой ошибок к узлам, экспорт в YAML и тестовый прогон
черновика тем же движком, что и в игре, — без публикации.
"""

from typing import Any

import yaml
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.analytics.insights import CATEGORY_TITLES
from app.api.deps import trainer_user
from app.api.scenarios import SERVICE_CLASS_TITLES, ScenarioSummary, summarize
from app.content import competencies
from app.engine import runtime
from app.engine.conditions import all_true
from app.engine.debrief import ROLE_MODEL
from app.engine.runtime import GameState
from app.engine.schema import ChoiceNode, EndingNode, Scenario, ScenarioError
from app.errors import AppError
from app.scenario_store import parse_uploaded

router = APIRouter(prefix="/editor", tags=["Редактор сценариев"], dependencies=[Depends(trainer_user)])

MAX_CONTENT = 200_000


class Content(BaseModel):
    content: str = Field(min_length=1, max_length=MAX_CONTENT, description="Сценарий в формате YAML или JSON")


def load_yaml(content: str) -> Any:
    try:
        return yaml.safe_load(content)
    except yaml.YAMLError as exc:
        raise AppError(422, "invalid_yaml", f"Не удалось разобрать YAML/JSON: {exc}") from None


@router.get("/dictionaries", summary="Справочники для форм редактора")
def dictionaries() -> dict[str, Any]:
    return {
        "competencies": [{"code": code, "title": item["title"]} for code, item in competencies().items()],
        "categories": [{"code": code, "title": title} for code, title in CATEGORY_TITLES.items()],
        "service_classes": [{"code": code, "title": title} for code, title in SERVICE_CLASS_TITLES.items()],
        "role_model": [{"code": code, "title": item["title"]} for code, item in ROLE_MODEL.items()],
    }


@router.post("/parse", summary="Разобрать YAML/JSON в объект (без проверки) — для импорта в редактор")
def parse(body: Content) -> dict[str, Any]:
    data = load_yaml(body.content)
    if not isinstance(data, dict):
        raise AppError(422, "invalid_scenario", "Сценарий должен быть объектом YAML/JSON")
    return {"data": data}


class IssueOut(BaseModel):
    node_id: str | None
    message: str


class EditorValidation(BaseModel):
    valid: bool
    issues: list[IssueOut] = []
    scenario: ScenarioSummary | None = None


@router.post("/validate", response_model=EditorValidation, summary="Проверка черновика с привязкой ошибок к узлам")
def validate(body: Content) -> EditorValidation:
    try:
        scenario = parse_uploaded(load_yaml(body.content))
    except ScenarioError as exc:
        return EditorValidation(valid=False, issues=[IssueOut(node_id=i.node_id, message=i.message) for i in exc.issues])
    return EditorValidation(valid=True, scenario=ScenarioSummary(**summarize(scenario)))


@router.post("/yaml", summary="Преобразовать черновик в YAML (для сохранения в репозиторий)")
def to_yaml(body: Content) -> dict[str, str]:
    data = load_yaml(body.content)
    return {"yaml": yaml.safe_dump(data, allow_unicode=True, sort_keys=False, width=120)}


class PreviewRequest(Content):
    state: dict[str, Any] | None = Field(default=None, description="Состояние из предыдущего шага; null — начать сначала")
    choice_id: str | None = None
    timeout: bool = False


def _node_view(scenario: Scenario, state: GameState) -> dict[str, Any]:
    node = scenario.nodes[state.node_id]
    if isinstance(node, EndingNode):
        return {"type": "ending", "ending": {"outcome": node.outcome, "title": node.title, "text": node.text}}
    assert isinstance(node, ChoiceNode)  # router-узлы движок проходит сам
    return {
        "type": "choice",
        "speaker": node.speaker,
        "speaker_name": node.speaker_name,
        "text": node.text,
        "timer": node.timer,
        # В режиме автора видно всё: качество, обратную связь, куда ведёт и доступен ли вариант.
        "choices": [
            {"id": c.id, "text": c.text, "quality": c.quality, "feedback": c.feedback, "next": c.next,
             "available": all_true(c.if_, state), "conditions": c.if_}
            for c in node.choices
        ],
    }


@router.post("/preview", summary="Тестовый шаг черновика тем же движком (без сохранения и без таймера)")
def preview(body: PreviewRequest) -> dict[str, Any]:
    scenario = parse_uploaded(load_yaml(body.content))
    last = None
    if body.state is None:
        state = runtime.start(scenario, now=0)
    else:
        try:
            state = GameState.from_dict(body.state)
        except TypeError:
            raise AppError(422, "invalid_state", "Некорректное состояние прогона — начните заново") from None
        if not isinstance(scenario.nodes.get(state.node_id), ChoiceNode) or state.finished:
            raise AppError(422, "invalid_state", "Состояние не соответствует черновику — начните заново")
        node = scenario.choice_node(state.node_id)
        chosen = next((c for c in node.choices if c.id == body.choice_id), None)
        # now = момент входа в узел: в режиме автора таймер не истекает сам, только по кнопке.
        try:
            record = runtime.decide(scenario, state, body.choice_id, now=state.node_entered_at,
                                    client_timeout=body.timeout)
        except (KeyError, TypeError, ValueError):  # состояние подменено или от другой версии черновика
            raise AppError(422, "invalid_state", "Состояние не соответствует черновику — начните заново") from None
        last = {
            **record,
            "choice_text": chosen.text if chosen and not record["timed_out"] else None,
            "feedback": node.on_timeout.feedback if record["timed_out"] and node.on_timeout else chosen.feedback,
        }
    return {
        "state": state.to_dict(),
        "node_id": state.node_id,
        "loyalty": state.loyalty,
        "safety": state.safety,
        "vars": state.vars,
        "flags": state.flags,
        "finished": state.finished,
        "last": last,
        **_node_view(scenario, state),
    }
