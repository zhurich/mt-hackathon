"""API визуального редактора: проверка с привязкой к узлам, тестовый прогон, импорт/экспорт."""

import json

import yaml

from app.content import SCENARIOS_DIR

API = "/api/v1/editor"


def scenario_json(name: str = "vape-smoking") -> dict:
    return yaml.safe_load((SCENARIOS_DIR / f"{name}.yaml").read_text(encoding="utf-8"))


def content(data: dict) -> dict:
    return {"content": json.dumps(data, ensure_ascii=False)}


def test_editor_is_trainer_only(client, conductor):
    assert client.get(f"{API}/dictionaries", headers=conductor).status_code == 403


def test_dictionaries(client, trainer):
    data = client.get(f"{API}/dictionaries", headers=trainer).json()
    assert len(data["competencies"]) == 7
    assert {item["code"] for item in data["role_model"]} == {"acknowledge", "rule", "solution", "assure"}


def test_validate_reports_issues_per_node(client, trainer):
    data = scenario_json()
    data["nodes"]["complies"]["choices"][0]["next"] = "missing"
    data["nodes"]["refuses"]["competencies"] = ["magic"]
    data["nodes"]["tambour"]["choices"][0]["quality"] = "excellent"  # ошибка формата (pydantic)
    result = client.post(f"{API}/validate", json=content(data), headers=trainer).json()
    assert not result["valid"]
    by_node = {issue["node_id"] for issue in result["issues"]}
    assert {"tambour"} <= by_node  # ошибки формата тоже привязаны к узлу

    data["nodes"]["tambour"]["choices"][0]["quality"] = "good"
    result = client.post(f"{API}/validate", json=content(data), headers=trainer).json()
    assert {"complies", "refuses"} <= {issue["node_id"] for issue in result["issues"]}


def test_validate_accepts_layout(client, trainer):
    data = scenario_json()
    data["layout"] = {"start": {"x": 0, "y": 0}, "response": {"x": 320, "y": 0}}
    result = client.post(f"{API}/validate", json=content(data), headers=trainer).json()
    assert result["valid"], result["issues"]


def test_preview_runs_draft_with_author_view(client, trainer):
    data = scenario_json()
    body = content(data)
    step = client.post(f"{API}/preview", json=body, headers=trainer).json()
    assert step["node_id"] == "start" and step["timer"] == 20
    assert all("quality" in choice and "feedback" in choice for choice in step["choices"])

    step = client.post(f"{API}/preview", json={**body, "state": step["state"], "choice_id": "private_rule"},
                       headers=trainer).json()
    assert step["last"]["delta"] == {"loyalty": -5, "safety": 20}
    assert step["last"]["feedback"]
    assert step["node_id"] == "complies"  # router прошёл сам: safety 75 >= 60

    timeout = client.post(f"{API}/preview", json=body, headers=trainer).json()
    timeout = client.post(f"{API}/preview", json={**body, "state": timeout["state"], "timeout": True},
                          headers=trainer).json()
    assert timeout["last"]["timed_out"] and timeout["node_id"] == "neighbour_complains"


def test_preview_rejects_invalid_draft_and_state(client, trainer):
    data = scenario_json()
    data["start"] = "nowhere"
    assert client.post(f"{API}/preview", json=content(data), headers=trainer).status_code == 422

    body = content(scenario_json())
    bad_state = client.post(f"{API}/preview", json={**body, "state": {"foo": 1}}, headers=trainer)
    assert bad_state.status_code == 422 and bad_state.json()["error"]["code"] == "invalid_state"


def test_parse_and_yaml_roundtrip(client, trainer):
    text = (SCENARIOS_DIR / "lost-child.yaml").read_text(encoding="utf-8")
    parsed = client.post(f"{API}/parse", json={"content": text}, headers=trainer).json()["data"]
    assert parsed["id"] == "lost-child"
    exported = client.post(f"{API}/yaml", json=content(parsed), headers=trainer).json()["yaml"]
    assert "Потерялся ребёнок" in exported  # кириллица без экранирования
    assert yaml.safe_load(exported) == parsed

    broken = client.post(f"{API}/parse", json={"content": "id: [unclosed"}, headers=trainer)
    assert broken.status_code == 422 and broken.json()["error"]["code"] == "invalid_yaml"
