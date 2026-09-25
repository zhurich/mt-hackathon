"""Исполнение сценария: старт, решение игрока, таймаут, переходы, прерывания, финал.

Состояние попытки (GameState) — обычный словарь в БД, поэтому backend не хранит
ничего в памяти между запросами и масштабируется горизонтально.
Алгоритм шага описан в docs/SPEC.md, раздел 6.
"""

from dataclasses import asdict, dataclass, field
from typing import Any

from app.engine.conditions import all_true
from app.engine.schema import Choice, ChoiceNode, Effects, EndingNode, RouterNode, Scenario

# Запас на сетевую задержку: ответ, пришедший чуть позже таймера, ещё засчитывается.
TIMER_GRACE_SEC = 2
# Защита от зацикливания router -> router.
MAX_ROUTER_HOPS = 50
SCALE_MIN, SCALE_MAX = 0, 100


class EngineError(Exception):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


@dataclass
class GameState:
    node_id: str
    loyalty: int
    safety: int
    service_class: str
    node_entered_at: float
    vars: dict[str, float] = field(default_factory=dict)
    flags: dict[str, bool] = field(default_factory=dict)
    path: list[dict[str, Any]] = field(default_factory=list)
    fired_interrupts: list[int] = field(default_factory=list)
    finished: bool = False
    outcome: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "GameState":
        return cls(**data)


def start(scenario: Scenario, now: float) -> GameState:
    state = GameState(
        node_id=scenario.start,
        loyalty=scenario.initial.loyalty,
        safety=scenario.initial.safety,
        service_class=scenario.service_class,
        node_entered_at=now,
        vars=dict(scenario.initial.vars),
    )
    _enter(scenario, state, scenario.start, now)
    return state


def available_choices(scenario: Scenario, state: GameState) -> list[Choice]:
    node = scenario.choice_node(state.node_id)
    return [choice for choice in node.choices if all_true(choice.if_, state)]


def deadline(scenario: Scenario, state: GameState) -> float | None:
    """Момент (unix time), после которого решение считается таймаутом (без учёта запаса)."""
    node = scenario.nodes[state.node_id]
    if isinstance(node, ChoiceNode) and node.timer:
        return state.node_entered_at + node.timer
    return None


def decide(
    scenario: Scenario,
    state: GameState,
    choice_id: str | None,
    now: float,
    client_timeout: bool = False,
) -> dict[str, Any]:
    """Применяет решение игрока (или таймаут) и продвигает сценарий. Возвращает запись решения."""
    if state.finished:
        raise EngineError("attempt_finished", "Сценарий уже завершён")
    node = scenario.choice_node(state.node_id)
    reaction_sec = max(0.0, now - state.node_entered_at)

    server_timeout = bool(node.timer) and reaction_sec > node.timer + TIMER_GRACE_SEC
    timed_out = server_timeout or client_timeout
    if timed_out and not node.timer:
        raise EngineError("no_timer", "В этом узле нет таймера")

    if timed_out:
        branch = node.on_timeout
        record = {"choice_id": None, "quality": None, "role_model": []}
    else:
        choice = next((c for c in available_choices(scenario, state) if c.id == choice_id), None)
        if choice is None:
            raise EngineError("choice_unavailable", "Такой вариант ответа недоступен")
        branch = choice
        record = {"choice_id": choice.id, "quality": choice.quality, "role_model": list(choice.role_model)}

    scales_before = {"loyalty": state.loyalty, "safety": state.safety}
    _apply(state, branch.effects)
    record.update(
        node_id=state.node_id,
        timed_out=timed_out,
        reaction_ms=round(min(reaction_sec, node.timer or reaction_sec) * 1000),
        timer=node.timer,
        competencies=list(node.competencies),
        delta={
            "loyalty": state.loyalty - scales_before["loyalty"],
            "safety": state.safety - scales_before["safety"],
        },
        loyalty=state.loyalty,
        safety=state.safety,
        interrupted_to=None,
    )

    target = branch.next
    for index, interrupt in enumerate(scenario.interrupts):
        if index not in state.fired_interrupts and all_true(interrupt.if_, state):
            state.fired_interrupts.append(index)
            target = interrupt.next
            record["interrupted_to"] = target
            break

    state.path.append(record)
    _enter(scenario, state, target, now)
    return record


def _apply(state: GameState, effects: Effects) -> None:
    state.loyalty = _clamp(state.loyalty + effects.loyalty)
    state.safety = _clamp(state.safety + effects.safety)
    for name, delta in effects.vars.items():
        state.vars[name] = state.vars.get(name, 0) + delta
    state.flags.update(effects.flags)


def _clamp(value: int) -> int:
    return max(SCALE_MIN, min(SCALE_MAX, value))


def _enter(scenario: Scenario, state: GameState, node_id: str, now: float) -> None:
    """Переходит в узел; невидимые router-узлы проходятся сразу, финал завершает попытку."""
    for _ in range(MAX_ROUTER_HOPS):
        node = scenario.nodes[node_id]
        if not isinstance(node, RouterNode):
            break
        node_id = next(route.next for route in node.routes if all_true(route.if_, state))
    else:
        raise EngineError("router_loop", "Сценарий зациклился на условных переходах")

    state.node_id = node_id
    state.node_entered_at = now
    if isinstance(node, EndingNode):
        state.finished = True
        state.outcome = node.outcome
