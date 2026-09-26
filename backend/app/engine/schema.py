"""Формат сценария (DSL) и его проверка.

Pydantic проверяет форму полей, `check_graph` — смысл: ссылки между узлами, достижимость,
условия, переменные, компетенции. Описание формата — docs/scenario-format.md.
"""

from collections import deque
from dataclasses import dataclass
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


class Position(DslModel):
    x: float
    y: float


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
    # Расположение узлов в визуальном редакторе. На игру не влияет.
    layout: dict[str, Position] = Field(default_factory=dict)

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


@dataclass(frozen=True)
class Issue:
    """Проблема в сценарии. node_id — узел, к которому она относится (для подсветки в редакторе)."""

    message: str
    node_id: str | None = None

    def __str__(self) -> str:
        return self.message


class ScenarioError(ValueError):
    def __init__(self, issues: list[Issue | str]):
        self.issues = [issue if isinstance(issue, Issue) else Issue(issue) for issue in issues]
        self.errors = [issue.message for issue in self.issues]
        super().__init__("; ".join(self.errors))


def _edges(node: ChoiceNode | RouterNode | EndingNode) -> list[str]:
    if isinstance(node, ChoiceNode):
        targets = [choice.next for choice in node.choices]
        if node.on_timeout:
            targets.append(node.on_timeout.next)
        return targets
    if isinstance(node, RouterNode):
        return [route.next for route in node.routes]
    return []


def check_graph(scenario: Scenario, known_competencies: set[str]) -> list[Issue]:
    """Возвращает список смысловых ошибок сценария (пустой — сценарий корректен)."""
    issues: list[Issue] = []
    nodes = scenario.nodes
    declared_vars = set(scenario.initial.vars)

    def add(message: str, node_id: str | None = None) -> None:
        issues.append(Issue(message, node_id))

    def check_target(where: str, target: str, node_id: str | None) -> None:
        if not target:
            add(f"{where}: не указано, куда ведёт переход", node_id)
        elif target not in nodes:
            add(f"{where}: ссылка на несуществующий узел '{target}'", node_id)

    def check_conditions(where: str, conditions: list[str], node_id: str | None) -> None:
        for text in conditions:
            try:
                condition = parse_condition(text)
            except ConditionError as exc:
                add(f"{where}: {exc}", node_id)
                continue
            if condition.var_name is not None and condition.var_name not in declared_vars:
                add(f"{where}: переменная '{condition.var_name}' не объявлена в initial.vars", node_id)

    def check_effects(where: str, effects: Effects, node_id: str) -> None:
        for name in effects.vars:
            if name not in declared_vars:
                add(f"{where}: переменная '{name}' не объявлена в initial.vars", node_id)

    check_target("start", scenario.start, None)
    for name in scenario.hud:
        if name not in declared_vars:
            add(f"hud: переменная '{name}' не объявлена в initial.vars")
    for index, interrupt in enumerate(scenario.interrupts):
        check_target(f"interrupts[{index}]", interrupt.next, None)
        check_conditions(f"interrupts[{index}]", interrupt.if_, None)

    for node_id, node in nodes.items():
        if isinstance(node, ChoiceNode):
            for code in node.competencies:
                if code not in known_competencies:
                    add(f"узел '{node_id}': неизвестная компетенция '{code}'", node_id)
            ids = [choice.id for choice in node.choices]
            if len(ids) != len(set(ids)):
                add(f"узел '{node_id}': id вариантов должны быть уникальны", node_id)
            if node.timer and not node.on_timeout:
                add(f"узел '{node_id}': задан timer, но нет on_timeout", node_id)
            if node.on_timeout and not node.timer:
                add(f"узел '{node_id}': задан on_timeout, но нет timer", node_id)
            for choice in node.choices:
                where = f"узел '{node_id}', вариант '{choice.id}'"
                check_target(where, choice.next, node_id)
                check_conditions(where, choice.if_, node_id)
                check_effects(where, choice.effects, node_id)
            if node.on_timeout:
                check_target(f"узел '{node_id}', on_timeout", node.on_timeout.next, node_id)
                check_effects(f"узел '{node_id}', on_timeout", node.on_timeout.effects, node_id)
            if all(choice.if_ for choice in node.choices):
                add(f"узел '{node_id}': хотя бы один вариант должен быть доступен без условия", node_id)
        elif isinstance(node, RouterNode):
            for index, route in enumerate(node.routes):
                where = f"узел '{node_id}', маршрут {index}"
                check_target(where, route.next, node_id)
                check_conditions(where, route.if_, node_id)
                is_last = index == len(node.routes) - 1
                if is_last and route.if_:
                    add(f"узел '{node_id}': последний маршрут должен быть без if (ветка «иначе»)", node_id)
                if not is_last and not route.if_:
                    add(f"узел '{node_id}': маршрут {index} без if перекрывает следующие маршруты", node_id)

    if issues:  # дальнейший анализ графа имеет смысл только при корректных ссылках
        return issues

    endings = {node_id for node_id, node in nodes.items() if isinstance(node, EndingNode)}
    if not endings:
        return [Issue("в сценарии нет ни одного узла ending")]

    # Прямой обход: всё достижимо из start (цели прерываний тоже считаем достижимыми).
    reachable = _bfs([scenario.start, *(i.next for i in scenario.interrupts)], lambda n: _edges(nodes[n]))
    for node_id in nodes.keys() - reachable:
        add(f"узел '{node_id}' недостижим из start", node_id)

    # Обратный обход от финалов: из каждого узла должен быть путь к финалу (нет «ловушек»).
    reverse: dict[str, list[str]] = {node_id: [] for node_id in nodes}
    for node_id, node in nodes.items():
        for target in _edges(node):
            reverse[target].append(node_id)
    can_finish = _bfs(list(endings), lambda n: reverse[n])
    for node_id in nodes.keys() - can_finish:
        add(f"из узла '{node_id}' нельзя дойти ни до одного финала", node_id)
    return issues


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
        raise ScenarioError([_pydantic_issue(err) for err in exc.errors()]) from None
    issues = check_graph(scenario, known_competencies)
    if issues:
        raise ScenarioError(issues)
    return scenario


def _pydantic_issue(err: dict[str, Any]) -> Issue:
    loc = err["loc"]
    location = ".".join(str(part) for part in loc)
    node_id = str(loc[1]) if len(loc) > 1 and loc[0] == "nodes" else None
    return Issue(f"{location}: {err['msg']}", node_id)
