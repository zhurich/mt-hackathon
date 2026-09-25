"""Настройки приложения. Берутся из переменных окружения или файла backend/.env (см. .env.example)."""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict

DEV_JWT_SECRET = "dev-only-insecure-secret-change-me-in-prod"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_env: str = "dev"  # dev | prod
    database_url: str = "sqlite:///./vsm.db"
    jwt_secret: str = DEV_JWT_SECRET
    jwt_ttl_minutes: int = 12 * 60
    cors_origins: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]

    # Демо-данные: синтетическая оргструктура, сотрудники и история прохождений.
    seed_demo: bool = True
    demo_password: str = "vsm2026"  # пароль всех демо-учётных записей
    # Ключ интеграции HR/LMS, который создаётся при сидировании. В БД хранится только его хэш.
    demo_integration_key: str = "demo-integration-key"

    # Геймификация
    points_ttl_days: int = 30  # через сколько дней сгорают баллы рейтинга
    points_expiry_warning_days: int = 5  # за сколько дней предупреждать о сгорании

    def check(self) -> None:
        if self.app_env != "dev" and self.jwt_secret == DEV_JWT_SECRET:
            raise RuntimeError("JWT_SECRET must be set outside of dev environment")


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    settings.check()
    return settings
