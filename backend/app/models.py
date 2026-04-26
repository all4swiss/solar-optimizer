"""
SQLAlchemy ORM models.

Tables:
  users            – registered users with hashed passwords
  solar_connections – Home Assistant credentials per user
  agent_sessions   – tracks Managed Agent sessions per user
"""
from datetime import datetime
from sqlalchemy import (
    String, Boolean, DateTime, ForeignKey, Text, func
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str] = mapped_column(String(255), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    solar_connection: Mapped["SolarConnection"] = relationship(
        back_populates="user", uselist=False, cascade="all, delete-orphan"
    )
    agent_sessions: Mapped[list["AgentSession"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )


class SolarConnection(Base):
    """Stores the user's Home Assistant credentials (encrypted in prod)."""
    __tablename__ = "solar_connections"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), unique=True, nullable=False)

    # Home Assistant connection details
    ha_url: Mapped[str] = mapped_column(String(512), nullable=False)       # e.g. http://192.168.1.50:8123
    ha_token: Mapped[str] = mapped_column(Text, nullable=False)             # Long-Lived Access Token
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False)       # set True after first successful ping

    # Optional metadata
    inverter_brand: Mapped[str] = mapped_column(String(100), nullable=True) # e.g. "SMA", "Fronius"
    battery_capacity_kwh: Mapped[float] = mapped_column(nullable=True)      # e.g. 10.0

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    user: Mapped["User"] = relationship(back_populates="solar_connection")


class AgentSession(Base):
    """
    Tracks a Claude Managed Agent session.
    One session per conversation thread.
    """
    __tablename__ = "agent_sessions"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)

    # Anthropic session ID (e.g. sess_abc123)
    anthropic_session_id: Mapped[str] = mapped_column(String(100), nullable=False, index=True)

    # Session title / summary for the sidebar
    title: Mapped[str] = mapped_column(String(255), default="Solar Optimisation Chat")
    status: Mapped[str] = mapped_column(String(50), default="active")  # active | archived

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    user: Mapped["User"] = relationship(back_populates="agent_sessions")
