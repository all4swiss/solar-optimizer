"""
Centralised settings via pydantic-settings.
All values come from environment variables / .env file.
"""
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=[".env", "../.env"],
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Anthropic
    ANTHROPIC_API_KEY: str
    SOLAR_AGENT_ID: str = "agent_011CaSxh4w2LmQc3wt4EB5HU"
    ANTHROPIC_ENVIRONMENT_ID: str = ""          # populated after one-time setup

    # Database
    DATABASE_URL: str = "postgresql+asyncpg://solar:solar_secret@db:5432/solaroptimizer"
    SYNC_DATABASE_URL: str = "postgresql+psycopg2://solar:solar_secret@db:5432/solaroptimizer"

    # Auth
    JWT_SECRET_KEY: str = "change-me"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30

    # CORS
    FRONTEND_URL: str = "http://localhost:3000"


settings = Settings()
