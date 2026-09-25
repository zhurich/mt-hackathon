"""Условия сценария — строки вида "<операнд> <оператор> <значение>".

Примеры: "safety < 40", "flags.chief_called == true", "vars.minutes_to_station <= 3", "class == business".
Никакого eval: строка делится на три части, операнд читается из состояния попытки.
"""

import operator
from dataclasses import dataclass
from functools import lru_cache
from typing import Protocol

OPERATORS = {
    "<": operator.lt,
    "<=": operator.le,
    ">": operator.gt,
    ">=": operator.ge,
    "==": operator.eq,
    "!=": operator.ne,
}
EQUALITY_ONLY = {"==", "!="}
SCALES = ("loyalty", "safety")

Value = int | float | bool | str


class ConditionError(ValueError):
    pass


class StateLike(Protocol):
    loyalty: int
    safety: int
    vars: dict[str, float]
    flags: dict[str, bool]
    service_class: str


@dataclass(frozen=True)
class Condition:
    operand: str
    op: str
    value: Value

    @property
    def var_name(self) -> str | None:
        return self.operand.removeprefix("vars.") if self.operand.startswith("vars.") else None

    def evaluate(self, state: StateLike) -> bool:
        return OPERATORS[self.op](resolve_operand(self.operand, state), self.value)


def parse_value(raw: str) -> Value:
    if raw in ("true", "false"):
        return raw == "true"
    for cast in (int, float):
        try:
            return cast(raw)
        except ValueError:
            pass
    return raw


@lru_cache(maxsize=2048)
def parse_condition(text: str) -> Condition:
    parts = text.split()
    if len(parts) != 3:
        raise ConditionError(f"условие '{text}': нужно ровно 3 части — операнд, оператор, значение")
    operand, op, raw = parts
    if op not in OPERATORS:
        raise ConditionError(f"условие '{text}': неизвестный оператор '{op}'")

    is_scale = operand in SCALES
    is_var = operand.startswith("vars.") and len(operand) > 5
    is_flag = operand.startswith("flags.") and len(operand) > 6
    is_class = operand == "class"
    if not (is_scale or is_var or is_flag or is_class):
        raise ConditionError(f"условие '{text}': неизвестный операнд '{operand}'")

    value = parse_value(raw)
    if (is_flag or is_class) and op not in EQUALITY_ONLY:
        raise ConditionError(f"условие '{text}': для '{operand}' допустимы только == и !=")
    if is_flag and not isinstance(value, bool):
        raise ConditionError(f"условие '{text}': флаг сравнивается с true/false")
    if (is_scale or is_var) and (isinstance(value, bool) or not isinstance(value, (int, float))):
        raise ConditionError(f"условие '{text}': '{operand}' сравнивается с числом")
    return Condition(operand, op, value)


def resolve_operand(operand: str, state: StateLike) -> Value:
    if operand in SCALES:
        return getattr(state, operand)
    if operand == "class":
        return state.service_class
    kind, name = operand.split(".", 1)
    if kind == "vars":
        return state.vars[name]
    return state.flags.get(name, False)


def all_true(conditions: list[str], state: StateLike) -> bool:
    """Логическое И по списку условий; пустой список — истина."""
    return all(parse_condition(text).evaluate(state) for text in conditions)
