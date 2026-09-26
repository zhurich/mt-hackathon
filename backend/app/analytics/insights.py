"""Личная аналитика: статистика, покрытие ролевой модели, текстовые выводы и рекомендации.

Выводы — правила над агрегатами (пороги ниже). Цель — не лог действий, а ответ на вопрос
«что у меня получается, что проседает и что тренировать дальше».
"""

from collections import defaultdict
from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from app.analytics.competencies import competency_overview
from app.engine.debrief import ROLE_MODEL
from app.gamification.context import MSK_OFFSET, finished_attempts
from app.models import Attempt, User
from app.scenario_store import latest_scenarios

CATEGORY_TITLES = {
    "medical": "Медицина",
    "conflict": "Конфликты",
    "safety": "Безопасность",
    "service": "Сервис",
    "accessibility": "Особые категории",
}
TIMEOUT_RATE_WARNING = 0.15
ROLE_STEP_RARE = 0.4
SCALE_IMBALANCE = 15


def _share(part: float, whole: float) -> float:
    return round(part / whole, 3) if whole else 0.0


def _stats(attempts: list[Attempt]) -> dict:
    decisions = sum(a.decisions for a in attempts)
    return {
        "attempts": len(attempts),
        "success_rate": _share(sum(a.outcome == "success" for a in attempts), len(attempts)),
        "avg_loyalty": round(sum(a.final_loyalty for a in attempts) / len(attempts)) if attempts else None,
        "avg_safety": round(sum(a.final_safety for a in attempts) / len(attempts)) if attempts else None,
        "timeout_rate": _share(sum(a.timeouts for a in attempts), decisions),
        "avg_reaction_ms": round(sum(a.avg_reaction_ms for a in attempts) / len(attempts)) if attempts else None,
    }


def _role_model_usage(attempts: list[Attempt]) -> list[dict]:
    return [
        {
            "code": code,
            "title": info["title"],
            "example": info["example"],
            "share": _share(sum(code in a.result["role_model_covered"] for a in attempts), len(attempts)),
        }
        for code, info in ROLE_MODEL.items()
    ]


def _categories(attempts: list[Attempt]) -> list[dict]:
    grouped: dict[str, list[Attempt]] = defaultdict(list)
    for attempt in attempts:
        grouped[attempt.category].append(attempt)
    return [
        {
            "category": category,
            "title": CATEGORY_TITLES.get(category, category),
            "attempts": len(items),
            "success_rate": _share(sum(a.outcome == "success" for a in items), len(items)),
        }
        for category, items in sorted(grouped.items())
    ]


def _xp_by_day(attempts: list[Attempt], now: datetime, days: int = 30) -> list[dict]:
    totals: dict[str, int] = defaultdict(int)
    for attempt in attempts:
        totals[(attempt.finished_at + MSK_OFFSET).date().isoformat()] += attempt.xp
    today = (now + MSK_OFFSET).date()
    series = []
    for offset in range(days - 1, -1, -1):
        day = (today - timedelta(days=offset)).isoformat()
        series.append({"date": day, "xp": totals.get(day, 0)})
    return series


def _insights(stats: dict, competencies: list[dict], role_usage: list[dict], categories: list[dict]) -> list[dict]:
    if not stats["attempts"]:
        return [{"kind": "info", "text": "Пройдите первый сценарий — после него здесь появятся выводы о ваших сильных и слабых сторонах."}]

    insights = []
    tested = [c for c in competencies if c["mastery"] is not None]
    weak = sorted((c for c in tested if c["status"] == "weak"), key=lambda c: c["mastery"])
    mastered = [c for c in tested if c["status"] == "mastered"]

    for item in weak[:2]:
        insights.append({"kind": "warning", "text": f"Проседает компетенция «{item['title']}» — {round(item['mastery'])} %. "
                                                     f"{item['description']}"})
    if stats["timeout_rate"] >= TIMEOUT_RATE_WARNING:
        insights.append({"kind": "warning", "text": f"В {round(stats['timeout_rate'] * 100)} % решений вы не успели ответить. "
                                                     "В критических ситуациях бездействие — худший вариант: тренируйте скорость реакции."})

    rare = [step for step in role_usage if step["share"] < ROLE_STEP_RARE]
    if rare:
        titles = ", ".join(f"«{step['title']}»" for step in rare)
        insights.append({"kind": "warning", "text": f"Вы редко используете шаги ролевой модели: {titles}. "
                                                     f"Например: {rare[0]['example']}"})

    if stats["avg_safety"] - stats["avg_loyalty"] >= SCALE_IMBALANCE:
        insights.append({"kind": "info", "text": "Безопасность вы обеспечиваете надёжно, но пассажиры часто остаются недовольны. "
                                                  "Добавьте эмпатии: признавайте ситуацию и благодарите за понимание."})
    elif stats["avg_loyalty"] - stats["avg_safety"] >= SCALE_IMBALANCE:
        insights.append({"kind": "warning", "text": "Вы стараетесь угодить пассажирам в ущерб безопасности. "
                                                     "Правила безопасности не обсуждаются — обозначайте их вежливо, но твёрдо."})

    tried = [c for c in categories if c["attempts"] >= 2]
    if tried:
        worst = min(tried, key=lambda c: c["success_rate"])
        if worst["success_rate"] < 0.5:
            insights.append({"kind": "warning", "text": f"Сложнее всего даются ситуации категории «{worst['title']}»: "
                                                         f"успех лишь в {round(worst['success_rate'] * 100)} % попыток."})

    if mastered:
        titles = ", ".join(f"«{c['title']}»" for c in mastered)
        insights.append({"kind": "positive", "text": f"Освоены компетенции: {titles}. Так держать!"})
    return insights


def _recommendations(db: Session, attempts: list[Attempt], competencies: list[dict]) -> list[dict]:
    succeeded = {a.scenario_id for a in attempts if a.outcome == "success"}
    tried = {a.scenario_id for a in attempts}
    focus = sorted(
        (c for c in competencies if c["mastery"] is not None and c["status"] != "mastered"),
        key=lambda c: c["mastery"],
    )
    candidates = [s for s in latest_scenarios(db) if s.id not in succeeded]
    recommendations: list[dict] = []
    # Сначала — по одному сценарию на каждую слабую компетенцию (от самой слабой), чтобы советы не повторялись.
    for competency in focus:
        scenario = next((s for s in candidates if competency["code"] in s.competencies), None)
        if scenario is None:
            continue
        candidates.remove(scenario)
        recommendations.append({"scenario_id": scenario.id, "title": scenario.title,
                                "reason": f"Тренирует «{competency['title']}» ({round(competency['mastery'])} %)"})
    # Затем — непройденные и не пройденные на успех.
    candidates.sort(key=lambda s: s.id in tried)
    for scenario in candidates:
        reason = "Сценарий ещё не пройден на успех" if scenario.id in tried else "Вы ещё не проходили этот сценарий"
        recommendations.append({"scenario_id": scenario.id, "title": scenario.title, "reason": reason})
    return recommendations[:3]


def personal_analytics(db: Session, user: User, now: datetime) -> dict:
    attempts = finished_attempts(db, user.id)
    competencies = competency_overview(db, user.id)
    stats = _stats(attempts)
    role_usage = _role_model_usage(attempts)
    categories = _categories(attempts)
    return {
        "stats": stats,
        "competencies": competencies,
        "role_model": role_usage,
        "categories": categories,
        "xp_by_day": _xp_by_day(attempts, now),
        "insights": _insights(stats, competencies, role_usage, categories),
        "recommendations": _recommendations(db, attempts, competencies),
    }
