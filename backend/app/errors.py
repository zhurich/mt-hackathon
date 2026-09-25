"""Единый формат ошибок API: {"error": {"code": "...", "message": "..."}}.

Внутренние детали (трассировки, SQL) наружу не отдаются — только в лог сервера.
"""

import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.engine.runtime import EngineError
from app.engine.schema import ScenarioError

log = logging.getLogger("vsm")


class AppError(Exception):
    def __init__(self, status: int, code: str, message: str, details: object | None = None):
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message
        self.details = details


def _body(code: str, message: str, details: object | None = None) -> dict:
    error: dict = {"code": code, "message": message}
    if details is not None:
        error["details"] = details
    return {"error": error}


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def app_error(_: Request, exc: AppError):
        return JSONResponse(_body(exc.code, exc.message, exc.details), status_code=exc.status)

    @app.exception_handler(EngineError)
    async def engine_error(_: Request, exc: EngineError):
        return JSONResponse(_body(exc.code, exc.message), status_code=409)

    @app.exception_handler(ScenarioError)
    async def scenario_error(_: Request, exc: ScenarioError):
        return JSONResponse(_body("invalid_scenario", "Сценарий не прошёл проверку", exc.errors), status_code=422)

    @app.exception_handler(RequestValidationError)
    async def validation_error(_: Request, exc: RequestValidationError):
        details = [{"field": ".".join(map(str, err["loc"])), "message": err["msg"]} for err in exc.errors()]
        return JSONResponse(_body("validation_error", "Некорректные данные запроса", details), status_code=422)

    @app.exception_handler(StarletteHTTPException)
    async def http_error(_: Request, exc: StarletteHTTPException):
        code = {404: "not_found", 405: "method_not_allowed"}.get(exc.status_code, "http_error")
        return JSONResponse(_body(code, str(exc.detail)), status_code=exc.status_code)

    @app.exception_handler(Exception)
    async def unhandled(_: Request, exc: Exception):
        log.exception("Unhandled error", exc_info=exc)
        return JSONResponse(_body("internal_error", "Внутренняя ошибка сервера"), status_code=500)
