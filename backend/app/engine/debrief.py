"""Разбор попытки: что выбрано, как изменились шкалы, почему, и как можно было поступить лучше."""

from typing import Any

from app.engine.runtime import GameState
from app.engine.schema import EndingNode, Scenario
from app.engine.scoring import QUALITY_SCORE, AttemptResult, decision_score

# Ролевая модель общения из материалов кейса («Ситуации на борту», слайд 2).
ROLE_MODEL = {
    "acknowledge": {
        "title": "Признать ситуацию",
        "example": "«Я Вас понимаю…», «Сожалею, что это доставило Вам дискомфорт…»",
    },
    "rule": {
        "title": "Обозначить правило",
        "example": "«Обращаю Ваше внимание, что…», «Информирую Вас о том, что…»",
    },
    "solution": {
        "title": "Предложить решение",
        "example": "«Я уточню и вернусь к Вам…», «Я приглашу начальника поезда…»",
    },
    "assure": {
        "title": "Заверить",
        "example": "«Благодарю Вас за понимание…», «Благодарю за обращение…»",
    },
}


def build_debrief(scenario: Scenario, state: GameState, result: AttemptResult) -> dict[str, Any]:
    ending = scenario.nodes[state.node_id]
    assert isinstance(ending, EndingNode)

    steps = [_decision_review(scenario, index, record) for index, record in enumerate(state.path, start=1)]
    missing = [code for code in ROLE_MODEL if code not in result.role_model_covered]
    return {
        "scenario_id": scenario.id,
        "title": scenario.title,
        "ending": {"outcome": ending.outcome, "title": ending.title, "text": ending.text},
        "sources": scenario.sources,
        "steps": steps,
        "role_model": {
            "covered": [{"code": code, **ROLE_MODEL[code]} for code in result.role_model_covered],
            "missing": [{"code": code, **ROLE_MODEL[code]} for code in missing],
        },
    }


def _decision_review(scenario: Scenario, index: int, record: dict[str, Any]) -> dict[str, Any]:
    node = scenario.choice_node(record["node_id"])
    if record["timed_out"]:
        chosen_text = "Время вышло — решение не принято"
        feedback = node.on_timeout.feedback if node.on_timeout else ""
    else:
        choice = next(c for c in node.choices if c.id == record["choice_id"])
        chosen_text, feedback = choice.text, choice.feedback

    chosen_score = decision_score(record)
    better = sorted(
        (c for c in node.choices if QUALITY_SCORE[c.quality] > chosen_score),
        key=lambda c: QUALITY_SCORE[c.quality],
        reverse=True,
    )
    return {
        "index": index,
        "situation": node.text,
        "speaker_name": node.speaker_name,
        "chosen": chosen_text,
        "quality": record["quality"] or "timeout",
        "timed_out": record["timed_out"],
        "reaction_ms": record["reaction_ms"],
        "timer": record["timer"],
        "feedback": feedback,
        "delta": record["delta"],
        "loyalty": record["loyalty"],
        "safety": record["safety"],
        "competencies": record["competencies"],
        "role_model": record["role_model"],
        "interrupted": record["interrupted_to"] is not None,
        "better_options": [
            {"text": c.text, "quality": c.quality, "feedback": c.feedback} for c in better[:2]
        ],
    }
