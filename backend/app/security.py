"""Пароли (PBKDF2-SHA256 из стандартной библиотеки), JWT-токены и хэши API-ключей."""

import hashlib
import hmac
import secrets
from datetime import UTC, datetime, timedelta

import jwt

from app.config import get_settings

PBKDF2_ITERATIONS = 200_000
JWT_ALGORITHM = "HS256"


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, PBKDF2_ITERATIONS)
    return f"pbkdf2_sha256${PBKDF2_ITERATIONS}${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str | None) -> bool:
    if not stored:
        return False
    try:
        _, iterations, salt_hex, digest_hex = stored.split("$")
    except ValueError:
        return False
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt_hex), int(iterations))
    return hmac.compare_digest(digest.hex(), digest_hex)


def create_token(user_id: int, role: str) -> str:
    settings = get_settings()
    expires = datetime.now(UTC) + timedelta(minutes=settings.jwt_ttl_minutes)
    payload = {"sub": str(user_id), "role": role, "exp": expires}
    return jwt.encode(payload, settings.jwt_secret, algorithm=JWT_ALGORITHM)


def decode_token(token: str) -> int | None:
    """Возвращает id пользователя или None, если токен недействителен или истёк."""
    try:
        payload = jwt.decode(token, get_settings().jwt_secret, algorithms=[JWT_ALGORITHM])
        return int(payload["sub"])
    except (jwt.PyJWTError, KeyError, ValueError):
        return None


def hash_api_key(key: str) -> str:
    return hashlib.sha256(key.encode()).hexdigest()
