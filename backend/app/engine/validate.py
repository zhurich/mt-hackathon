"""Проверка файлов сценариев без запуска сервера.

Запуск из папки backend:
    python -m app.engine.validate                              # все сценарии
    python -m app.engine.validate content/scenarios/x.yaml     # конкретные файлы
"""

import sys
from pathlib import Path

from app.content import parse_scenario_file, scenario_files
from app.engine.schema import ScenarioError


def main(argv: list[str]) -> int:
    sys.stdout.reconfigure(encoding="utf-8")  # кириллица в консоли Windows
    paths = [Path(arg) for arg in argv] or scenario_files()
    failed = 0
    for path in paths:
        try:
            scenario = parse_scenario_file(path)
        except ScenarioError as exc:
            failed += 1
            print(f"ОШИБКА {path.name}")
            for error in exc.errors:
                print(f"   - {error}")
        else:
            print(f"OK     {path.name}: {len(scenario.nodes)} узлов, {scenario.decision_nodes} решений")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
