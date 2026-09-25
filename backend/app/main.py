"""Точка входа FastAPI. Swagger UI — /docs, OpenAPI-схема — /openapi.json."""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from app.api import attempts, auth, integration, profile, scenarios
from app.config import get_settings
from app.db import Base, SessionLocal, engine
from app.errors import install_error_handlers
from app.scenario_store import sync_from_files
from app.seed import seed_demo

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("vsm")

API_PREFIX = "/api/v1"


@asynccontextmanager
async def lifespan(_: FastAPI):
    settings = get_settings()
    Base.metadata.create_all(engine)
    with SessionLocal() as db:
        published = sync_from_files(db)
        if published:
            log.info("Published scenarios: %s", ", ".join(published))
        if settings.seed_demo:
            seed_demo(db)
    yield


app = FastAPI(
    title="ВСМ Тренажёр API",
    version="1.0.0",
    description=(
        "Backend геймифицированного тренажёра проводников высокоскоростной магистрали: "
        "движок сценариев, начисление очков компетенций, геймификация, аналитика и API для HR/LMS.\n\n"
        "Авторизация пользователей — Bearer JWT (`POST /api/v1/auth/login`), "
        "внешних систем — заголовок `X-API-Key`."
    ),
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().cors_origins,
    allow_methods=["GET", "POST", "PUT"],
    allow_headers=["Authorization", "Content-Type", "X-API-Key"],
)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    return response


install_error_handlers(app)

for module in (auth, scenarios, attempts, profile, integration):
    app.include_router(module.router, prefix=API_PREFIX)


@app.get("/api/health", tags=["Служебное"], summary="Проверка работоспособности")
def health() -> dict:
    return {"status": "ok"}
