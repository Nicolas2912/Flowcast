from __future__ import annotations

from collections.abc import Generator
from functools import lru_cache

from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import get_settings


@lru_cache
def get_engine() -> Engine:
    settings = get_settings()
    connect_args = {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}
    return create_engine(settings.database_url, connect_args=connect_args, future=True)


SessionLocal = sessionmaker(autoflush=False, autocommit=False, future=True)


def reset_engine() -> None:
    bound_engine = SessionLocal.kw.get("bind")
    if bound_engine is not None:
        bound_engine.dispose()
    get_engine.cache_clear()
    SessionLocal.configure(bind=get_engine())


reset_engine()


def get_db_session() -> Generator[Session, None, None]:
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()
