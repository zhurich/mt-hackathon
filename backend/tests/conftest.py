import os
import tempfile
from pathlib import Path

# Отдельная БД для тестов — задаётся до импорта приложения (engine создаётся при импорте app.db).
TEST_DB = Path(tempfile.gettempdir()) / f"vsm-test-{os.getpid()}.db"
TEST_DB.unlink(missing_ok=True)
os.environ["DATABASE_URL"] = f"sqlite:///{TEST_DB.as_posix()}"
os.environ["SEED_DEMO"] = "true"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

DEMO_PASSWORD = "vsm2026"


@pytest.fixture(scope="session")
def client():
    from app.main import app

    with TestClient(app) as test_client:
        yield test_client


def login(client, user: str) -> dict:
    response = client.post("/api/v1/auth/login", json={"login": user, "password": DEMO_PASSWORD})
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


@pytest.fixture(scope="session")
def conductor(client):
    return login(client, "maria")


@pytest.fixture(scope="session")
def trainer(client):
    return login(client, "trainer")
