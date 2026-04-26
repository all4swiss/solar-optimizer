"""
Database configuration – async SQLAlchemy 2.0.
Supports both PostgreSQL (asyncpg) and SQLite (aiosqlite) for dev.
"""
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import DeclarativeBase

from app.config import settings

# SQLite doesn't support pool_size / max_overflow
_is_sqlite = settings.DATABASE_URL.startswith("sqlite")
_engine_kwargs = (
    {"pool_pre_ping": True} if _is_sqlite
    else {"pool_pre_ping": True, "pool_size": 10, "max_overflow": 20}
)

# Async engine
engine = create_async_engine(
    settings.DATABASE_URL,
    echo=False,
    **_engine_kwargs,
)

AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncSession:
    """FastAPI dependency – yields a DB session per request."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()
