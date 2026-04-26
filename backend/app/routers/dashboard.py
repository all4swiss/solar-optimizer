"""
Dashboard router – aggregated stats for the main dashboard.
"""
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.auth import get_current_user
from app.database import get_db
from app.mcp.home_assistant import get_solar_status, get_daily_yield
from app.models import SolarConnection, User

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/overview")
async def overview(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Returns all data needed for the dashboard homepage.
    Falls back to demo data if no HA connection is configured.
    """
    result = await db.execute(
        select(SolarConnection).where(SolarConnection.user_id == current_user.id)
    )
    conn = result.scalar_one_or_none()

    if not conn:
        # Return demo / placeholder data so the UI looks good before setup
        return _demo_data()

    try:
        status = await get_solar_status(conn.ha_url, conn.ha_token)
        yield_data = await get_daily_yield(conn.ha_url, conn.ha_token)

        solar_w = status.get("solar_power_w", 0)
        battery_soc = status.get("battery_soc_pct", 0)
        grid_w = status.get("grid_power_w", 0)
        consumption_w = status.get("home_consumption_w", 0)
        daily_kwh = yield_data.get("daily_yield_kwh", solar_w / 1000)

        # Estimate savings: self-consumed kWh × 0.25 CHF
        self_consumed_w = max(0, solar_w + min(0, grid_w))  # solar - export
        savings = (self_consumed_w / 1000) * 0.25

        return {
            "has_connection": True,
            "is_verified": conn.is_verified,
            "solar_power_w": solar_w,
            "battery_soc_pct": battery_soc,
            "grid_power_w": grid_w,
            "home_consumption_w": consumption_w,
            "daily_yield_kwh": daily_kwh,
            "daily_savings_chf": round(savings, 2),
            "inverter_brand": conn.inverter_brand,
            "battery_capacity_kwh": conn.battery_capacity_kwh,
            "last_updated": datetime.utcnow().isoformat(),
        }
    except Exception as e:
        # HA unreachable – return stale indicator
        return {
            "has_connection": True,
            "is_verified": False,
            "error": "Home Assistant unreachable",
            **_demo_data(),
        }


def _demo_data() -> dict:
    """Placeholder data for users who haven't connected yet."""
    return {
        "has_connection": False,
        "is_verified": False,
        "solar_power_w": 3200.0,
        "battery_soc_pct": 72.0,
        "grid_power_w": -450.0,
        "home_consumption_w": 1850.0,
        "daily_yield_kwh": 14.2,
        "daily_savings_chf": 2.85,
        "inverter_brand": None,
        "battery_capacity_kwh": None,
        "last_updated": datetime.utcnow().isoformat(),
        "demo": True,
    }
