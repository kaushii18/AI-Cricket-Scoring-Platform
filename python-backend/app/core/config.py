"""Environment-backed application settings."""

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv


load_dotenv(Path(__file__).resolve().parents[2] / ".env")


def _csv_environment(name: str, default: str) -> list[str]:
    values = os.getenv(name, default)
    return [value.strip() for value in values.split(",") if value.strip()]


@dataclass(frozen=True)
class Settings:
    app_name: str = os.getenv("APP_NAME", "CricPulse Python API")
    api_prefix: str = os.getenv("API_PREFIX", "/api/v1")
    host: str = os.getenv("HOST", "127.0.0.1")
    port: int = int(os.getenv("PORT", "8000"))
    node_api_base_url: str = os.getenv(
        "NODE_API_BASE_URL", "http://127.0.0.1:3000/api"
    ).rstrip("/")
    cricketdata_api_key: str = os.getenv("CRICKETDATA_API_KEY", "")
    cors_origins: list[str] | None = None

    def __post_init__(self) -> None:
        object.__setattr__(
            self,
            "cors_origins",
            _csv_environment(
                "CORS_ORIGINS",
                "http://localhost:3000,http://127.0.0.1:3000",
            ),
        )


settings = Settings()