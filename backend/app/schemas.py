"""
Pydantic request / response schemas.
"""
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, EmailStr, ConfigDict


# ─── Auth ─────────────────────────────────────────────────────────────────────

class UserCreate(BaseModel):
    email: EmailStr
    password: str
    full_name: Optional[str] = None


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: str
    full_name: Optional[str]
    is_active: bool
    created_at: datetime


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RefreshTokenRequest(BaseModel):
    refresh_token: str


# ─── Solar Connection ─────────────────────────────────────────────────────────

class SolarConnectionCreate(BaseModel):
    ha_url: str
    ha_token: str
    inverter_brand: Optional[str] = None
    battery_capacity_kwh: Optional[float] = None


class SolarConnectionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    ha_url: str
    is_verified: bool
    inverter_brand: Optional[str]
    battery_capacity_kwh: Optional[float]
    created_at: datetime


# ─── Dashboard ────────────────────────────────────────────────────────────────

class SolarStatus(BaseModel):
    """Live data fetched from Home Assistant."""
    solar_power_w: float           # current PV generation in Watts
    battery_soc_pct: float         # battery state of charge 0-100%
    grid_power_w: float            # positive = import, negative = export
    home_consumption_w: float      # total home load
    daily_yield_kwh: float         # today's PV yield
    daily_savings_chf: float       # estimated savings today
    timestamp: datetime
    source: str = "home_assistant"


# ─── Agent ───────────────────────────────────────────────────────────────────

class AgentSessionCreate(BaseModel):
    title: Optional[str] = "Solar Optimisation Chat"


class AgentSessionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    anthropic_session_id: str
    title: str
    status: str
    created_at: datetime


class SendMessageRequest(BaseModel):
    message: str


class MCPToolResult(BaseModel):
    """Used when backend handles a custom tool call from the agent."""
    tool_use_id: str
    result: str
    is_error: bool = False
