import time
from collections import defaultdict, deque

from fastapi import APIRouter
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.api.deps import CurrentUser, Db
from app.errors import AppError
from app.models import User
from app.security import create_token, verify_password

router = APIRouter(prefix="/auth", tags=["Auth"])

# Простая защита от перебора пароля: не больше 5 неудачных попыток за минуту на логин.
# Работает в пределах одного процесса — для продакшена нужен общий счётчик (Redis).
MAX_FAILURES, WINDOW_SEC = 5, 60
_failures: dict[str, deque[float]] = defaultdict(deque)


class LoginRequest(BaseModel):
    login: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=1, max_length=128)


class UserOut(BaseModel):
    id: int
    login: str
    display_name: str
    employee_code: str
    role: str
    brigade: str | None
    depot: str | None


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


def user_out(user: User) -> UserOut:
    return UserOut(
        id=user.id,
        login=user.login,
        display_name=user.display_name,
        employee_code=user.employee_code,
        role=user.role,
        brigade=user.brigade.name if user.brigade else None,
        depot=user.depot.name if user.depot else None,
    )


def _too_many_failures(login: str) -> bool:
    history = _failures[login]
    while history and history[0] < time.monotonic() - WINDOW_SEC:
        history.popleft()
    return len(history) >= MAX_FAILURES


@router.post("/login", response_model=LoginResponse, summary="Вход по логину и паролю")
def login(body: LoginRequest, db: Db) -> LoginResponse:
    login_key = body.login.lower()
    if _too_many_failures(login_key):
        raise AppError(429, "too_many_attempts", "Слишком много попыток входа. Подождите минуту")
    user = db.scalar(select(User).where(User.login == login_key))
    if user is None or not verify_password(body.password, user.password_hash):
        _failures[login_key].append(time.monotonic())
        raise AppError(401, "invalid_credentials", "Неверный логин или пароль")
    _failures.pop(login_key, None)
    return LoginResponse(access_token=create_token(user.id, user.role), user=user_out(user))


@router.get("/me", response_model=UserOut, summary="Текущий пользователь")
def me(user: CurrentUser) -> UserOut:
    return user_out(user)
