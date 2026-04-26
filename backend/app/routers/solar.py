"""
Solar connection router.
Handles the Home Assistant wizard (connect, verify, update, delete).
"""
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.auth import get_current_user
from app.database import get_db
from app.mcp.home_assistant import get_solar_status
from app.models import SolarConnection, User
from app.schemas import SolarConnectionCreate, SolarConnectionOut, SolarStatus

router = APIRouter(prefix="/solar", tags=["solar"])


@router.post("/connect", response_model=SolarConnectionOut, status_code=status.HTTP_201_CREATED)
async def connect_solar(
    payload: SolarConnectionCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Save Home Assistant credentials and verify connectivity."""
    # Verify the HA connection is reachable
    try:
        status_data = await get_solar_status(payload.ha_url, payload.ha_token)
        is_verified = "error" not in str(status_data)
    except Exception:
        is_verified = False

    # Upsert: one connection per user
    result = await db.execute(
        select(SolarConnection).where(SolarConnection.user_id == current_user.id)
    )
    existing = result.scalar_one_or_none()

    if existing:
        existing.ha_url = payload.ha_url
        existing.ha_token = payload.ha_token
        existing.inverter_brand = payload.inverter_brand
        existing.battery_capacity_kwh = payload.battery_capacity_kwh
        existing.is_verified = is_verified
        await db.commit()
        await db.refresh(existing)
        return existing
    else:
        conn = SolarConnection(
            user_id=current_user.id,
            ha_url=payload.ha_url,
            ha_token=payload.ha_token,
            inverter_brand=payload.inverter_brand,
            battery_capacity_kwh=payload.battery_capacity_kwh,
            is_verified=is_verified,
        )
        db.add(conn)
        await db.commit()
        await db.refresh(conn)
        return conn


@router.get("/connection", response_model=SolarConnectionOut)
async def get_connection(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(SolarConnection).where(SolarConnection.user_id == current_user.id)
    )
    conn = result.scalar_one_or_none()
    if not conn:
        raise HTTPException(status_code=404, detail="No solar connection configured")
    return conn


@router.delete("/connection", status_code=status.HTTP_204_NO_CONTENT)
async def delete_connection(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(SolarConnection).where(SolarConnection.user_id == current_user.id)
    )
    conn = result.scalar_one_or_none()
    if conn:
        await db.delete(conn)
        await db.commit()


@router.get("/status", response_model=SolarStatus)
async def live_status(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Fetch live data from Home Assistant."""
    result = await db.execute(
        select(SolarConnection).where(SolarConnection.user_id == current_user.id)
    )
    conn = result.scalar_one_or_none()
    if not conn:
        raise HTTPException(status_code=404, detail="No solar connection configured")

    data = await get_solar_status(conn.ha_url, conn.ha_token)

    # Estimate savings (placeholder: 0.25 CHF/kWh for self-consumption)
    solar_kwh = data["solar_power_w"] / 1000
    grid_power = data["grid_power_w"]
    self_consumed_w = max(0, data["solar_power_w"] - max(0, -grid_power))
    daily_savings = (self_consumed_w / 1000) * 0.25

    return SolarStatus(
        solar_power_w=data["solar_power_w"],
        battery_soc_pct=data["battery_soc_pct"],
        grid_power_w=data["grid_power_w"],
        home_consumption_w=data["home_consumption_w"],
        daily_yield_kwh=solar_kwh,
        daily_savings_chf=daily_savings,
        timestamp=datetime.utcnow(),
    )
