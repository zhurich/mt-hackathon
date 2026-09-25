"""Проверки реальных сценариев из content/scenarios: не только формат, но и игровой баланс."""

import pytest

from app.content import parse_scenario_file, scenario_files
from app.engine import runtime
from app.engine.scoring import QUALITY_SCORE

SCENARIOS = [parse_scenario_file(path) for path in scenario_files()]
IDS = [scenario.id for scenario in SCENARIOS]


def play(scenario, pick):
    """Проходит сценарий, на каждом шаге выбирая вариант функцией pick(узел, доступные варианты).
    pick возвращает None — значит, игрок не успел ответить (таймаут)."""
    state = runtime.start(scenario, now=0)
    clock = 0
    while not state.finished:
        clock += 1
        node = scenario.nodes[state.node_id]
        choice = pick(node, runtime.available_choices(scenario, state))
        if choice is None:
            runtime.decide(scenario, state, None, now=clock, client_timeout=True)
        else:
            runtime.decide(scenario, state, choice.id, now=clock)
        assert len(state.path) < 30, "сценарий слишком длинный или зациклился"
    return state


def best(node, choices):
    return max(choices, key=lambda c: QUALITY_SCORE[c.quality])


def worst(node, choices):
    return min(choices, key=lambda c: QUALITY_SCORE[c.quality])


def timeout_or_worst(node, choices):
    return None if node.timer else worst(node, choices)


def test_all_demo_scenarios_present():
    assert set(IDS) >= {
        "medical-emergency", "drunk-passenger", "vape-smoking", "double-booking",
        "unattended-item", "lost-child", "wheelchair-passenger",
    }


@pytest.mark.parametrize("scenario", SCENARIOS, ids=IDS)
def test_best_choices_lead_to_success(scenario):
    assert play(scenario, best).outcome == "success"


@pytest.mark.parametrize("scenario", SCENARIOS, ids=IDS)
def test_worst_choices_lead_to_failure(scenario):
    assert play(scenario, worst).outcome == "fail"


@pytest.mark.parametrize("scenario", [s for s in SCENARIOS if any(
    getattr(n, "timer", None) for n in s.nodes.values())], ids=lambda s: s.id)
def test_timeouts_never_lead_to_success(scenario):
    """Бездействие под таймером не должно приводить к лучшему исходу."""
    assert play(scenario, timeout_or_worst).outcome != "success"


@pytest.mark.parametrize("scenario", SCENARIOS, ids=IDS)
def test_scenario_is_non_linear(scenario):
    outcomes = {node.outcome for node in scenario.nodes.values() if node.type == "ending"}
    assert {"success", "fail"} <= outcomes
    assert scenario.decision_nodes >= 4
