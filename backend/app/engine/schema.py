"""Формат сценария (DSL) и его проверка.

Pydantic проверяет форму полей, `check_graph` — смысл: ссылки между узлами, достижимость,
условия, переменные, компетенции. Описание формата — docs/scenario-format.md.
"""

from collections import deque
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationError

from app.engine.conditions import ConditionError, parse_condition

Quality = Literal["best", "good", "poor", "bad"]
RoleStep = Literal["acknowledge", "rule", "solution", "assure"]
Outcome = Literal["success", "partial", "fail"]
Category = Literal["medical", "conflict", "safety", "service", "accessibility"]
ServiceClass = Literal["standard", "comfort", "business", "first"]
Speaker = Literal["narrator", "passenger", "chief", "colleague", "child", "radio", "system"]


class DslModel(BaseModel):
    # Опечатка в имени поля YAML должна быть ошибкой, а не молча игнорироваться.
    model_config = ConfigDict(extra="forbid", populate_by_name=True)


class Effects(DslModel):
    loyalty: int = 0
    safety: int = 0
    vars: dict[str, float] = Field(default_factory=dict)
    flags: dict[str, bool] = Field(default_factory=dict)


class Choice(DslModel):
    id: str
    text: str
    quality: Quality
    feedback: str
    next: str
    effects: Effects = Field(default_factory=Effects)
    role_model: list[RoleStep] = Field(default_factory=list)
    if_: list[str] = Field(default_factory=list, alias="if")


class Timeout(DslModel):
    feedback: str
    next: str
    effects: Effects = Field(default_factory=Effects)


class ChoiceNode(DslModel):
    type: Literal["choice"]
    text: str
    competencies: list[str] = Field(min_length=1)
    choices: list[Choice] = Field(min_length=2)
    speaker: Speaker = "narrator"
    speaker_name: str | None = None
    timer: int | None = Field(default=None, ge=5, le=180)
    on_timeout: Timeout | None = None


class Route(DslModel):
    next: str
    if_: list[str] = Field(default_factory=list, alias="if")


class RouterNode(DslModel):
    type: Literal["router"]
    routes: list[Route] = Field(min_length=1)


class EndingNode(DslModel):
    type: Literal["ending"]
    outcome: Outcome
    title: str
    text: str


Node = Annotated[ChoiceNode | RouterNode | EndingNode, Field(discriminator="type")]


class Interrupt(DslModel):
    if_: list[str] = Field(min_length=1, alias="if")
    next: str


class Initial(DslModel):
    loyalty: int = Field(default=50, ge=0, le=100)
    safety: int = Field(default=50, ge=0, le=100)
    vars: dict[str, float] = Field(default_factory=dict)


class Scenario(DslModel):
    id: str = Field(pattern=r"^[a-z0-9][a-z0-9-]{1,63}$")
    version: int = Field(ge=1)
    title: str
    summary: str
    category: Category
    difficulty: int = Field(ge=1, le=3)
    service_class: ServiceClass
    briefing: str
    start: str
    nodes: dict[str, Node]
    initial: Initial = Field(default_factory=Initial)
    sources: list[str] = Field(default_factory=list)
    interrupts: list[Interrupt] = Field(default_factory=list)
    # Переменные, которые интерфейс показывает игроку: {имя переменной: подпись}.
    hud: dict[str, str] = Field(default_factory=dict)

    @property
    def competencies(self) -> list[str]:
        codes = {c for node in self.nodes.values() if isinstance(node, ChoiceNode) for c in node.competencies}
        return sorted(codes)

    @property
    def decision_nodes(self) -> int:
        return sum(isinstance(node, ChoiceNode) for node in self.nodes.values())

    def choice_node(self, node_id: str) -> ChoiceNode:
        node = self.nodes[node_id]
        assert isinstance(node, ChoiceNode), f"{node_id} is not a choice node"
        return node


class ScenarioError(ValueError):
    def __init__(self, errors: list[str]):
        super().__init__("; ".join(errors))
        self.errors = errors


def _edges(node: ChoiceNode | RouterNode | EndingNode) -> list[str]:
    if isinstance(node, ChoiceNode):
        targets = [choice.next for choice in node.choices]
        if node.on_timeout:
            targets.append(node.on_timeout.next)
        return targets
    if isinstance(node, RouterNode):
        return [route.next for route in node.routes]
    return []


def check_graph(scenario: Scenario, known_competencies: set[str]) -> list[str]:
    """Возвращает список смысловых ошибок сценария (пустой — сценарий корректен)."""
    errors: list[str] = []
    nodes = scenario.nodes
    declared_vars = set(scenario.initial.vars)

    def check_target(where: str, target: str) -> None:
        if target not in nodes:
            errors.append(f"{where}: ссылка на несуществующий узел '{target}'")

    def check_conditions(where: str, conditions: list[str]) -> None:
        for text in conditions:
            try:
                condition = parse_condition(text)
            except ConditionError as exc:
                errors.append(f"{where}: {exc}")
                continue
            if condition.var_name is not None and condition.var_name not in declared_vars:
                errors.append(f"{where}: переменная '{condition.var_name}' не объявлена в initial.vars")

    def check_effects(where: str, effects: Effects) -> None:
        for name in effects.vars:
            if name not in declared_vars:
                errors.append(f"{where}: переменная '{name}' не объявлена в initial.vars")

    check_target("start", scenario.start)
    for name in scenario.hud:
        if name not in declared_vars:
            errors.append(f"hud: переменная '{name}' не объявлена в initial.vars")
    for index, interrupt in enumerate(scenario.interrupts):
        check_target(f"interrupts[{index}]", interrupt.next)
        check_conditions(f"interrupts[{index}]", interrupt.if_)

    for node_id, node in nodes.items():
        if isinstance(node, ChoiceNode):
            for code in node.competencies:
                if code not in known_competencies:
                    errors.append(f"узел '{node_id}': неизвестная компетенция '{code}'")
            ids = [choice.id for choice in node.choices]
            if len(ids) != len(set(ids)):
                errors.append(f"узел '{node_id}': id вариантов должны быть уникальны")
            if node.timer and not node.on_timeout:
                errors.append(f"узел '{node_id}': задан timer, но нет on_timeout")
            if node.on_timeout and not node.timer:
                errors.append(f"узел '{node_id}': задан on_timeout, но нет timer")
            for choice in node.choices:
                where = f"узел '{node_id}', вариант '{choice.id}'"
                check_target(where, choice.next)
                check_conditions(where, choice.if_)
                check_effects(where, choice.effects)
            if node.on_timeout:
                check_target(f"узел '{node_id}', on_timeout", node.on_timeout.next)
                check_effects(f"узел '{node_id}', on_timeout", node.on_timeout.effects)
            if all(choice.if_ for choice in node.choices):
                errors.append(f"узел '{node_id}': хотя бы один вариант должен быть доступен без условия")
        elif isinstance(node, RouterNode):
            for index, route in enumerate(node.routes):
                where = f"узел '{node_id}', маршрут {index}"
                check_target(where, route.next)
                check_conditions(where, route.if_)
                is_last = index == len(node.routes) - 1
                if is_last and route.if_:
                    errors.append(f"узел '{node_id}': последний маршрут должен быть без if (ветка «иначе»)")
                if not is_last and not route.if_:
                    errors.append(f"узел '{node_id}': маршрут {index} без if перекрывает следующие маршруты")

    if errors:  # дальнейший анализ графа имеет смысл только при корректных ссылках
        return errors

    endings = {node_id for node_id, node in nodes.items() if isinstance(node, EndingNode)}
    if not endings:
        return ["в сценарии нет ни одного узла ending"]

    # Прямой обход: всё достижимо из start (цели прерываний тоже считаем достижимыми).
    reachable = _bfs([scenario.start, *(i.next for i in scenario.interrupts)], lambda n: _edges(nodes[n]))
    for node_id in nodes.keys() - reachable:
        errors.append(f"узел '{node_id}' недостижим из start")

    # Обратный обход от финалов: из каждого узла должен быть путь к финалу (нет «ловушек»).
    reverse: dict[str, list[str]] = {node_id: [] for node_id in nodes}
    for node_id, node in nodes.items():
        for target in _edges(node):
            reverse[target].append(node_id)
    can_finish = _bfs(list(endings), lambda n: reverse[n])
    for node_id in nodes.keys() - can_finish:
        errors.append(f"из узла '{node_id}' нельзя дойти ни до одного финала")
    return errors


def _bfs(starts: list[str], neighbours) -> set[str]:
    seen = set(starts)
    queue = deque(starts)
    while queue:
        for target in neighbours(queue.popleft()):
            if target not in seen:
                seen.add(target)
                queue.append(target)
    return seen


def load_scenario(data: dict[str, Any], known_competencies: set[str]) -> Scenario:
    """Разбирает и полностью проверяет сценарий. Бросает ScenarioError со списком всех проблем."""
    try:
        scenario = Scenario.model_validate(data)
    except ValidationError as exc:
        raise ScenarioError([_format_pydantic_error(err) for err in exc.errors()]) from None
    errors = check_graph(scenario, known_competencies)
    if errors:
        raise ScenarioError(errors)
    return scenario


def _format_pydantic_error(err: dict[str, Any]) -> str:
    location = ".".join(str(part) for part in err["loc"])
    return f"{location}: {err['msg']}"
