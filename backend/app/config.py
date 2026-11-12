"""Runtime settings, read from environment variables."""

from __future__ import annotations

import os
from dataclasses import dataclass, field

DEV_JWT_SECRET = "dev-only-jwt-secret-change-me-in-production"
DEV_WEBHOOK_SECRET = "dev-webhook-secret"


@dataclass(frozen=True)
class Settings:
    database_url: str = "sqlite:///./sikabridge.db"
    jwt_secret: str = DEV_JWT_SECRET
    jwt_ttl_minutes: int = 12 * 60
    webhook_secret: str = DEV_WEBHOOK_SECRET
    pbkdf2_iterations: int = 600_000
    quote_ttl_seconds: int = 10 * 60
    cors_origins: list[str] = field(
        default_factory=lambda: ["http://localhost:5173", "http://127.0.0.1:5173"]
    )


def get_settings() -> Settings:
    origins = os.getenv("CORS_ORIGINS")
    return Settings(
        database_url=os.getenv("DATABASE_URL", Settings.database_url),
        jwt_secret=os.getenv("JWT_SECRET", DEV_JWT_SECRET),
        jwt_ttl_minutes=int(os.getenv("JWT_TTL_MINUTES", str(Settings.jwt_ttl_minutes))),
        webhook_secret=os.getenv("WEBHOOK_SECRET", DEV_WEBHOOK_SECRET),
        pbkdf2_iterations=int(os.getenv("PBKDF2_ITERATIONS", str(Settings.pbkdf2_iterations))),
        quote_ttl_seconds=int(os.getenv("QUOTE_TTL_SECONDS", str(Settings.quote_ttl_seconds))),
        cors_origins=(
            [o.strip() for o in origins.split(",") if o.strip()]
            if origins
            else Settings().cors_origins
        ),
    )
