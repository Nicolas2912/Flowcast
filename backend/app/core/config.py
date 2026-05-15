from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


ROOT_DIR = Path(__file__).resolve().parents[3]


class Settings(BaseSettings):
    app_name: str = "Flowcast API"
    app_env: str = "development"
    app_version: str = "0.1.0"
    api_prefix: str = "/api/v1"
    database_url: str = Field(
        default=f"sqlite:///{ROOT_DIR / 'flowcast.db'}",
        alias="FLOWCAST_DATABASE_URL",
    )

    model_config = SettingsConfigDict(
        env_file=ROOT_DIR / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
        populate_by_name=True,
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()
