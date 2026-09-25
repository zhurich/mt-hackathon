"""Зависимости FastAPI: сессия БД, текущий пользователь, проверка роли, API-ключ интеграции."""

from typing import Annotated

from fastapi import Depends, Header
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.errors import AppError
from app.models import ApiKey, User
from app.security import decode_token, hash_api_key

bearer = HTTPBearer(auto_error=False, description="JWT из POST /api/v1/auth/login")

Db = Annotated[Session, Depends(get_db)]


def current_user(db: Db, credentials: HTTPAuthorizationCredentials | None = Depends(bearer)) -> User:
    user_id = decode_token(credentials.credentials) if credentials else None
    user = db.get(User, user_id) if user_id else None
    if user is None:
        raise AppError(401, "unauthorized", "Требуется вход в систему")
    return user


CurrentUser = Annotated[User, Depends(current_user)]


def trainer_user(user: CurrentUser) -> User:
    if user.role != "trainer":
        raise AppError(403, "forbidden", "Доступно только тренеру")
    return user


TrainerUser = Annotated[User, Depends(trainer_user)]


def integration_client(db: Db, x_api_key: str | None = Header(default=None)) -> ApiKey:
    key = db.scalar(select(ApiKey).where(ApiKey.key_hash == hash_api_key(x_api_key))) if x_api_key else None
    if key is None:
        raise AppError(401, "invalid_api_key", "Неверный или отсутствующий заголовок X-API-Key")
    return key


IntegrationClient = Annotated[ApiKey, Depends(integration_client)]
