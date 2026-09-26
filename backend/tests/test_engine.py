import copy

import pytest

from app.engine import runtime
from app.engine.conditions import ConditionError, parse_condition
from app.engine.debrief import build_debrief
from app.engine.schema import ScenarioError, load_scenario
from app.engine.scoring import score_attempt

COMPETENCIES = {"safety", "communication", "escalation"}

BASE = {
    "id": "test-scenario",
    "version": 1,
    "title": "Тест",
    "summary": "Тестовый сценарий",
    "category": "safety",
    "difficulty": 2,
    "service_class": "business",
    "briefing": "Вагон 3",
    "initial": {"loyalty": 50, "safety": 50, "vars": {"minutes": 5}},
    "start": "start",
    "interrupts": [{"if": ["safety <= 10"], "next": "end_fail"}],
    "nodes": {
        "start": {
            "type": "choice",
            "text": "Пассажир курит",
            "competencies": ["safety", "communication"],
            "timer": 20,
            "on_timeout": {"effects": {"safety": -30}, "feedback": "Медлили", "next": "check"},
            "choices": [
                {"id": "rule", "text": "Прошу прекратить", "quality": "best", "feedback": "Верно",
                 "role_model": ["acknowledge", "rule"], "effects": {"safety": 20, "vars": {"minutes": -1}},
                 "next": "check"},
                {"id": "ignore", "text": "Игнорировать", "quality": "bad", "feedback": "Нельзя",
                 "effects": {"safety": -45}, "next": "check"},
                {"id": "vip", "text": "Предложить плед", "quality": "poor", "feedback": "Не к месту",
                 "if": ["class == first"], "next": "check"},
            ],
        },
        "check": {
            "type": "router",
            "routes": [
                {"if": ["safety >= 60"], "next": "call_chief"},
                {"next": "end_partial"},
            ],
        },
        "call_chief": {
            "type": "choice",
            "text": "Пассажир спорит",
            "competencies": ["escalation"],
            "choices": [
                {"id": "chief", "text": "Пригласить НП", "quality": "best", "feedback": "Верно",
                 "effects": {"flags": {"chief_called": True}}, "next": "end_ok"},
                {"id": "argue", "text": "Спорить", "quality": "bad", "feedback": "Нельзя", "next": "end_partial"},
            ],
        },
        "end_ok": {"type": "ending", "outcome": "success", "title": "Успех", "text": "Всё хорошо"},
        "end_partial": {"type": "ending", "outcome": "partial", "title": "Частично", "text": "Так себе"},
        "end_fail": {"type": "ending", "outcome": "fail", "title": "Провал", "text": "Опасно"},
    },
}


def make(**overrides):
    data = copy.deepcopy(BASE)
    data.update(overrides)
    return load_scenario(data, COMPETENCIES)


def test_best_path_reaches_success_and_scores():
    scenario = make()
    state = runtime.start(scenario, now=0)
    runtime.decide(scenario, state, "rule", now=3)
    assert state.node_id == "call_chief"  # router пропустил: safety 70 >= 60
    assert state.vars["minutes"] == 4
    runtime.decide(scenario, state, "chief", now=5)

    assert state.finished and state.outcome == "success"
    assert state.flags == {"chief_called": True}
    result = score_attempt(scenario, state)
    # 2 решения best: safety 10 + communication 10 + escalation 10, бонус исхода 30*2, скорость +2 (3с < 10с)
    assert result.xp == 30 + 60 + 2
    assert result.competency_results == {"safety": 100, "communication": 100, "escalation": 100}
    assert result.role_model_covered == ["acknowledge", "rule"]


def test_interrupt_fires_on_low_safety():
    scenario = make()
    state = runtime.start(scenario, now=0)
    runtime.decide(scenario, state, "ignore", now=1)
    # safety 50 - 45 = 5 -> срабатывает прерывание раньше router
    assert state.outcome == "fail"
    assert state.path[0]["interrupted_to"] == "end_fail"


def test_client_timeout_takes_timeout_branch():
    scenario = make()
    state = runtime.start(scenario, now=0)
    record = runtime.decide(scenario, state, None, now=20, client_timeout=True)
    assert record["timed_out"] and record["quality"] is None
    assert state.safety == 20
    assert state.outcome == "partial"


def test_server_detects_late_answer_as_timeout():
    scenario = make()
    state = runtime.start(scenario, now=0)
    record = runtime.decide(scenario, state, "rule", now=20 + runtime.TIMER_GRACE_SEC + 1)
    assert record["timed_out"]
    assert state.safety == 20  # эффект таймаута, а не выбранного варианта


def test_answer_within_grace_is_accepted():
    scenario = make()
    state = runtime.start(scenario, now=0)
    record = runtime.decide(scenario, state, "rule", now=21)
    assert not record["timed_out"]


def test_conditional_choice_hidden_and_rejected():
    scenario = make()
    state = runtime.start(scenario, now=0)
    assert [c.id for c in runtime.available_choices(scenario, state)] == ["rule", "ignore"]
    with pytest.raises(runtime.EngineError) as exc:
        runtime.decide(scenario, state, "vip", now=1)
    assert exc.value.code == "choice_unavailable"


def test_decide_after_finish_is_rejected():
    scenario = make()
    state = runtime.start(scenario, now=0)
    runtime.decide(scenario, state, "ignore", now=1)
    with pytest.raises(runtime.EngineError):
        runtime.decide(scenario, state, "rule", now=2)


def test_scales_are_clamped():
    scenario = make(initial={"loyalty": 50, "safety": 95, "vars": {"minutes": 5}})
    state = runtime.start(scenario, now=0)
    runtime.decide(scenario, state, "rule", now=1)
    assert state.safety == 100


def test_state_roundtrip_through_dict():
    scenario = make()
    state = runtime.start(scenario, now=0)
    runtime.decide(scenario, state, "rule", now=1)
    restored = runtime.GameState.from_dict(state.to_dict())
    runtime.decide(scenario, restored, "chief", now=2)
    assert restored.outcome == "success"


def test_debrief_suggests_better_option():
    scenario = make()
    state = runtime.start(scenario, now=0)
    runtime.decide(scenario, state, None, now=20, client_timeout=True)
    debrief = build_debrief(scenario, state, score_attempt(scenario, state))
    step = debrief["steps"][0]
    assert step["quality"] == "timeout"
    assert step["better_options"][0]["text"] == "Прошу прекратить"
    assert {item["code"] for item in debrief["role_model"]["missing"]} == {"acknowledge", "rule", "solution", "assure"}


@pytest.mark.parametrize(
    ("mutate", "message"),
    [
        (lambda d: d["nodes"]["start"]["choices"][0].update(next="nowhere"), "несуществующий узел 'nowhere'"),
        (lambda d: d["nodes"]["start"]["choices"][0].update(next=""), "не указано, куда ведёт переход"),
        (lambda d: d["nodes"]["start"].pop("on_timeout"), "нет on_timeout"),
        (lambda d: d["nodes"]["check"]["routes"].reverse(), "последний маршрут должен быть без if"),
        (lambda d: d["nodes"]["start"]["choices"][0].update({"if": ["vars.speed > 3"]}), "'speed' не объявлена"),
        (lambda d: d["nodes"]["call_chief"].update(competencies=["magic"]), "неизвестная компетенция"),
        (lambda d: d["nodes"].update(orphan={"type": "ending", "outcome": "fail", "title": "x", "text": "x"}),
         "недостижим"),
        (lambda d: d["nodes"]["call_chief"]["choices"][1].update(next="call_chief"), None),
    ],
)
def test_validation(mutate, message):
    data = copy.deepcopy(BASE)
    mutate(data)
    if message is None:  # цикл с выходом к финалу допустим
        load_scenario(data, COMPETENCIES)
        return
    with pytest.raises(ScenarioError) as exc:
        load_scenario(data, COMPETENCIES)
    assert message in str(exc.value)


def test_trap_node_without_path_to_ending_is_rejected():
    data = copy.deepcopy(BASE)
    data["nodes"]["call_chief"]["choices"][0]["next"] = "call_chief"
    data["nodes"]["call_chief"]["choices"][1]["next"] = "call_chief"
    with pytest.raises(ScenarioError) as exc:
        load_scenario(data, COMPETENCIES)
    assert "нельзя дойти ни до одного финала" in str(exc.value)


def test_unknown_field_is_rejected():
    data = copy.deepcopy(BASE)
    data["nodes"]["start"]["choices"][0]["efects"] = {}
    with pytest.raises(ScenarioError):
        load_scenario(data, COMPETENCIES)


@pytest.mark.parametrize("text", ["safety<40", "flags.x > true", "safety == yes", "foo < 1", "loyalty ~ 3"])
def test_bad_conditions(text):
    with pytest.raises(ConditionError):
        parse_condition(text)
