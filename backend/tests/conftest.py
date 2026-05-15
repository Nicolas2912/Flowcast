from __future__ import annotations

import os
from pathlib import Path

import pytest
from fastapi.testclient import TestClient


TEST_DB_DIR = Path(__file__).resolve().parent / ".tmp"
TEST_DB_DIR.mkdir(exist_ok=True)
TEST_DB_PATH = TEST_DB_DIR / "test.db"
os.environ["FLOWCAST_DATABASE_URL"] = f"sqlite:///{TEST_DB_PATH}"

from alembic import command
from alembic.config import Config

from app.main import create_app
from app.db.session import reset_engine


@pytest.fixture(autouse=True)
def reset_database():
    reset_engine()
    if TEST_DB_PATH.exists():
        TEST_DB_PATH.unlink()

    alembic_cfg = Config(str(Path(__file__).resolve().parents[2] / "alembic.ini"))
    alembic_cfg.set_main_option("sqlalchemy.url", os.environ["FLOWCAST_DATABASE_URL"])
    command.upgrade(alembic_cfg, "head")
    yield

    reset_engine()
    if TEST_DB_PATH.exists():
        TEST_DB_PATH.unlink()


@pytest.fixture()
def client() -> TestClient:
    return TestClient(create_app())
