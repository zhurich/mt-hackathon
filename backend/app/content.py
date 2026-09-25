"""Загрузка контента из папки backend/content: справочники и сценарии (YAML)."""

from functools import lru_cache
from pathlib import Path
from typing import Any

import yaml

from app.engine.schema import Scenario, ScenarioError, load_scenario

CONTENT_DIR = Path(__file__).resolve().parent.parent / "content"
SCENARIOS_DIR = CONTENT_DIR / "scenarios"


def read_yaml(path: Path) -> Any:
    with path.open(encoding="utf-8") as file:
        return yaml.safe_load(file)


@lru_cache
def competencies() -> dict[str, dict[str, str]]:
    return {item["code"]: item for item in read_yaml(CONTENT_DIR / "competencies.yaml")}


def parse_scenario_file(path: Path) -> Scenario:
    try:
        return load_scenario(read_yaml(path), set(competencies()))
    except ScenarioError as exc:
        raise ScenarioError([f"{path.name}: {error}" for error in exc.errors]) from None


def scenario_files() -> list[Path]:
    return sorted(SCENARIOS_DIR.glob("*.yaml"))
