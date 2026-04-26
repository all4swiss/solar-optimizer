"""
Home Assistant MCP Tool Stubs
─────────────────────────────
These functions simulate what will eventually be called by the Claude Managed
Agent via MCP custom tools. For MVP, the backend resolves `agent.custom_tool_use`
events and calls these functions directly.

Future: register these as MCP server tools so the agent can call them natively.

Read-only tools (safe for MVP):
  - get_solar_status()   → current PV power, battery SoC, grid flow
  - get_battery_soc()    → battery state of charge
  - get_daily_yield()    → today's energy production

Write tools (require user confirmation in production):
  - set_battery_mode()   → change charge/discharge strategy
"""

from datetime import datetime
from typing import Any
import aiohttp


# ─── Read-only tools ──────────────────────────────────────────────────────────

async def get_solar_status(ha_url: str, ha_token: str) -> dict[str, Any]:
    """
    Fetches current solar + battery status from Home Assistant.

    Expected HA entities (configure in .env or UI):
      sensor.solar_power          – PV generation in W
      sensor.battery_soc          – battery SoC in %
      sensor.grid_power           – grid import/export in W (+ = import)
      sensor.home_consumption     – total home load in W
    """
    headers = {"Authorization": f"Bearer {ha_token}", "Content-Type": "application/json"}
    entities = [
        "sensor.solar_power",
        "sensor.battery_soc",
        "sensor.grid_power",
        "sensor.home_consumption",
    ]

    results: dict[str, Any] = {}

    async with aiohttp.ClientSession() as session:
        for entity_id in entities:
            try:
                async with session.get(
                    f"{ha_url}/api/states/{entity_id}",
                    headers=headers,
                    ssl=False,
                    timeout=aiohttp.ClientTimeout(total=5),
                ) as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        results[entity_id] = float(data.get("state", 0))
                    else:
                        results[entity_id] = 0.0
            except Exception:
                results[entity_id] = 0.0

    return {
        "solar_power_w": results.get("sensor.solar_power", 0.0),
        "battery_soc_pct": results.get("sensor.battery_soc", 0.0),
        "grid_power_w": results.get("sensor.grid_power", 0.0),
        "home_consumption_w": results.get("sensor.home_consumption", 0.0),
        "timestamp": datetime.utcnow().isoformat(),
    }


async def get_battery_soc(ha_url: str, ha_token: str) -> dict[str, Any]:
    """Returns battery state of charge as a percentage."""
    headers = {"Authorization": f"Bearer {ha_token}"}
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(
                f"{ha_url}/api/states/sensor.battery_soc",
                headers=headers,
                ssl=False,
                timeout=aiohttp.ClientTimeout(total=5),
            ) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    soc = float(data.get("state", 0))
                    return {"battery_soc_pct": soc, "unit": "%"}
    except Exception:
        pass
    return {"battery_soc_pct": 0.0, "unit": "%", "error": "Could not reach Home Assistant"}


async def get_daily_yield(ha_url: str, ha_token: str) -> dict[str, Any]:
    """Returns today's PV energy yield in kWh."""
    headers = {"Authorization": f"Bearer {ha_token}"}
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(
                f"{ha_url}/api/states/sensor.solar_energy_today",
                headers=headers,
                ssl=False,
                timeout=aiohttp.ClientTimeout(total=5),
            ) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    yield_kwh = float(data.get("state", 0))
                    return {"daily_yield_kwh": yield_kwh, "unit": "kWh"}
    except Exception:
        pass
    return {"daily_yield_kwh": 0.0, "unit": "kWh"}


# ─── Write tools (require confirmation) ──────────────────────────────────────

async def set_battery_mode(
    ha_url: str,
    ha_token: str,
    mode: str,  # "charge" | "discharge" | "auto" | "hold"
) -> dict[str, Any]:
    """
    Sets the battery operating mode via a HA service call.
    ⚠️  WRITE OPERATION – must be gated behind user confirmation.

    Future implementation:
      POST /api/services/input_select/select_option
      with entity_id: input_select.battery_mode, option: <mode>
    """
    allowed_modes = {"charge", "discharge", "auto", "hold"}
    if mode not in allowed_modes:
        return {"success": False, "error": f"Invalid mode. Allowed: {allowed_modes}"}

    headers = {
        "Authorization": f"Bearer {ha_token}",
        "Content-Type": "application/json",
    }
    payload = {
        "entity_id": "input_select.battery_mode",
        "option": mode,
    }
    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(
                f"{ha_url}/api/services/input_select/select_option",
                headers=headers,
                json=payload,
                ssl=False,
                timeout=aiohttp.ClientTimeout(total=10),
            ) as resp:
                success = resp.status in (200, 204)
                return {"success": success, "mode_set": mode if success else None}
    except Exception as e:
        return {"success": False, "error": str(e)}


# ─── Tool dispatcher (used by agent router) ──────────────────────────────────

TOOL_REGISTRY = {
    "get_solar_status": get_solar_status,
    "get_battery_soc": get_battery_soc,
    "get_daily_yield": get_daily_yield,
    # set_battery_mode is intentionally NOT in registry – requires explicit confirmation
}

WRITE_TOOLS = {"set_battery_mode"}


async def dispatch_tool(
    tool_name: str,
    tool_input: dict,
    ha_url: str,
    ha_token: str,
) -> dict[str, Any]:
    """Route a custom tool call from the Managed Agent to the correct handler."""
    if tool_name in WRITE_TOOLS:
        return {
            "error": "CONFIRMATION_REQUIRED",
            "message": f"Tool '{tool_name}' requires user confirmation before execution.",
        }

    handler = TOOL_REGISTRY.get(tool_name)
    if not handler:
        return {"error": f"Unknown tool: {tool_name}"}

    return await handler(ha_url, ha_token, **{k: v for k, v in tool_input.items()
                                               if k not in ("ha_url", "ha_token")})
