"""Сквозные проверки API: полный цикл «сценарий → очки → достижения → рейтинг → уведомления»,
права доступа, интеграция и предсказуемые ошибки."""

from pathlib import Path

from app.content import SCENARIOS_DIR, parse_scenario_file
from app.engine.scoring import QUALITY_SCORE
from tests.conftest import login

API = "/api/v1"
INTEGRATION_KEY = {"X-API-Key": "demo-integration-key"}


def best_choice(scenario, node_id: str, available: list[dict]) -> str:
    node = scenario.nodes[node_id]
    ids = {item["id"] for item in available}
    return max((c for c in node.choices if c.id in ids), key=lambda c: QUALITY_SCORE[c.quality]).id


def play_best(client, headers, scenario_id: str) -> dict:
    scenario = parse_scenario_file(SCENARIOS_DIR / f"{scenario_id}.yaml")
    view = client.post(f"{API}/attempts", json={"scenario_id": scenario_id}, headers=headers).json()
    while view["status"] == "active":
        node = view["node"]
        choice = best_choice(scenario, node["id"], node["choices"])
        view = client.post(f"{API}/attempts/{view['id']}/decisions", json={"choice_id": choice}, headers=headers).json()
    return view


def test_login_errors(client):
    response = client.post(f"{API}/auth/login", json={"login": "demo", "password": "wrong"})
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "invalid_credentials"
    assert client.get(f"{API}/profile").json()["error"]["code"] == "unauthorized"


def test_play_hides_answer_quality(client, conductor):
    view = client.post(f"{API}/attempts", json={"scenario_id": "vape-smoking"}, headers=conductor).json()
    choice = view["node"]["choices"][0]
    assert set(choice) == {"id", "text"}  # ни quality, ни feedback до разбора
    assert view["node"]["deadline_ms"] > view["server_time_ms"]


def test_choice_order_is_shuffled_but_stable(client, conductor):
    first_ids = set()
    for _ in range(6):
        view = client.post(f"{API}/attempts", json={"scenario_id": "medical-emergency"}, headers=conductor).json()
        again = client.get(f"{API}/attempts/{view['id']}", headers=conductor).json()
        assert again["node"]["choices"] == view["node"]["choices"]  # перезагрузка не меняет порядок
        first_ids.add(view["node"]["choices"][0]["id"])
    assert len(first_ids) > 1  # лучший вариант не всегда на первом месте


def test_full_cycle_updates_profile_and_rating(client):
    headers = login(client, "natalia")
    before = client.get(f"{API}/profile", headers=headers).json()

    finished = play_best(client, headers, "double-booking")
    assert finished["ending"]["outcome"] == "success"
    rewards = finished["rewards"]
    assert rewards["xp"] > 0

    after = client.get(f"{API}/profile", headers=headers).json()
    assert after["total_xp"] == before["total_xp"] + rewards["xp"] + sum(
        c["reward_xp"] for c in rewards["completed_challenges"])
    assert after["finished_attempts"] == before["finished_attempts"] + 1
    four_steps = next(a for a in after["achievements"] if a["code"] == "four-steps")
    assert four_steps["earned_at"] is not None  # в double-booking лучший путь покрывает все 4 шага

    board = client.get(f"{API}/leaderboard?scope=brigade", headers=headers).json()
    assert board["me"]["points"] == after["active_points"]
    assert all(entry["brigade"] == after["user"]["brigade"] for entry in board["entries"])

    notes = client.get(f"{API}/notifications", headers=headers).json()
    assert any(n["kind"] == "achievement" for n in notes["items"])


def test_profile_reset_clears_progress(client):
    headers = login(client, "igor")
    play_best(client, headers, "double-booking")
    assert client.post(f"{API}/profile/reset", headers=headers).status_code == 204

    profile = client.get(f"{API}/profile", headers=headers).json()
    assert profile["total_xp"] == 0
    assert profile["active_points"] == 0
    assert profile["finished_attempts"] == 0
    assert not any(a["earned_at"] for a in profile["achievements"])
    assert all(c["samples"] == 0 for c in profile["competencies"])
    assert client.get(f"{API}/attempts", headers=headers).json() == []


def test_debrief_explains_every_decision(client, conductor):
    view = client.post(f"{API}/attempts", json={"scenario_id": "lost-child"}, headers=conductor).json()
    attempt_id = view["id"]
    view = client.post(f"{API}/attempts/{attempt_id}/decisions", json={"timeout": True}, headers=conductor).json()
    assert view["last"]["timed_out"]
    while view["status"] == "active":
        view = client.post(f"{API}/attempts/{attempt_id}/decisions",
                           json={"choice_id": view["node"]["choices"][-1]["id"]}, headers=conductor).json()

    debrief = client.get(f"{API}/attempts/{attempt_id}/debrief", headers=conductor).json()
    assert debrief["steps"][0]["quality"] == "timeout"
    assert debrief["steps"][0]["better_options"]
    assert all(step["feedback"] for step in debrief["steps"])
    assert debrief["sources"]


def test_invalid_actions_are_rejected_predictably(client, conductor):
    view = client.post(f"{API}/attempts", json={"scenario_id": "vape-smoking"}, headers=conductor).json()
    url = f"{API}/attempts/{view['id']}/decisions"

    wrong = client.post(url, json={"choice_id": "no-such-choice"}, headers=conductor)
    assert wrong.status_code == 409 and wrong.json()["error"]["code"] == "choice_unavailable"

    both = client.post(url, json={"choice_id": "x", "timeout": True}, headers=conductor)
    assert both.status_code == 422 and both.json()["error"]["code"] == "validation_error"

    other = client.get(f"{API}/attempts/{view['id']}", headers=login(client, "oleg"))
    assert other.status_code == 404

    early = client.get(f"{API}/attempts/{view['id']}/debrief", headers=conductor)
    assert early.status_code == 409

    missing = client.post(f"{API}/attempts", json={"scenario_id": "nope"}, headers=conductor)
    assert missing.status_code == 404 and missing.json()["error"]["code"] == "scenario_not_found"


def test_trainer_only_endpoints(client, conductor, trainer):
    assert client.get(f"{API}/analytics/team", headers=conductor).status_code == 403
    team = client.get(f"{API}/analytics/team", headers=trainer).json()
    assert team["brigades"] and team["employees"] and team["hardest_decisions"]
    graph = client.get(f"{API}/scenarios/lost-child/graph", headers=trainer).json()
    assert "nodes" in graph


def test_upload_scenario_new_version(client, trainer, conductor):
    content = Path(SCENARIOS_DIR / "lost-child.yaml").read_text(encoding="utf-8")

    same = client.post(f"{API}/scenarios", json={"content": content}, headers=trainer)
    assert same.status_code == 409  # версия не увеличена

    broken = content.replace("next: ask\n", "next: nowhere\n", 1)
    check = client.post(f"{API}/scenarios/validate", json={"content": broken}, headers=trainer).json()
    assert not check["valid"] and any("nowhere" in error for error in check["errors"])

    bumped = content.replace("version: 1", "version: 2", 1).replace("timer: 30", "timer: 12", 1)
    created = client.post(f"{API}/scenarios", json={"content": bumped}, headers=trainer)
    assert created.status_code == 201
    view = client.post(f"{API}/attempts", json={"scenario_id": "lost-child"}, headers=conductor).json()
    assert view["node"]["timer"] == 12  # новая версия применяется без перезапуска и правки кода


def test_personal_analytics(client, conductor):
    data = client.get(f"{API}/analytics/me", headers=conductor).json()
    assert data["stats"]["attempts"] > 0
    assert len(data["competencies"]) == 7
    assert data["insights"] and data["recommendations"]
    assert len(data["xp_by_day"]) == 30


def test_integration_api(client):
    assert client.get(f"{API}/integration/employees").status_code == 401

    units = client.get(f"{API}/integration/org-units", headers=INTEGRATION_KEY).json()
    brigade_id = next(unit["id"] for unit in units if unit["kind"] == "brigade")
    body = {"display_name": "Новый сотрудник", "employee_code": "SYN-9001", "brigade_id": brigade_id,
            "initial_password": "strong-pass-1"}
    created = client.put(f"{API}/integration/employees/HR-9001", json=body, headers=INTEGRATION_KEY)
    assert created.status_code == 200 and created.json()["external_id"] == "HR-9001"
    assert client.post(f"{API}/auth/login", json={"login": "syn-9001", "password": "strong-pass-1"}).status_code == 200

    conflict = client.put(f"{API}/integration/employees/HR-9002", json={**body, "initial_password": None},
                          headers=INTEGRATION_KEY)
    assert conflict.status_code == 409

    results = client.get(f"{API}/integration/results?limit=5", headers=INTEGRATION_KEY).json()
    assert results and "competency_results" in results[0]
    events = client.get(f"{API}/integration/events?limit=3", headers=INTEGRATION_KEY).json()
    assert events["statements"][0]["verb"]["id"].startswith("http://adlnet.gov/expapi/verbs/")
