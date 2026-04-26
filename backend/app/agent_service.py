"""
Claude Managed Agent Service
─────────────────────────────
Manages the lifecycle of Anthropic Managed Agent sessions for each user.

Architecture:
  - Agent (agent_011CaSxh4w2LmQc3wt4EB5HU) is PRE-CREATED on the Anthropic platform.
    Do NOT call agents.create() at runtime.
  - One shared Environment is created once (setup_environment()) and reused.
  - Each conversation = one Session (sessions.create() → store in DB → reuse).
  - Streaming uses SSE: stream-first, then send, yield events to FastAPI.

MCP / Custom Tools:
  When the agent emits agent.custom_tool_use, this service dispatches the call
  to app.mcp.home_assistant and returns user.custom_tool_result.
"""

import json
import logging
import os
from typing import AsyncGenerator

import anthropic
from anthropic import APIError

from app.config import settings
from app.mcp.home_assistant import dispatch_tool

logger = logging.getLogger(__name__)

# ─── Shared Anthropic client (module-level singleton) ────────────────────────

_client: anthropic.Anthropic | None = None


def get_client() -> anthropic.Anthropic:
    global _client
    if _client is None:
        _client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)
    return _client


# ─── One-time environment setup ──────────────────────────────────────────────

async def setup_environment() -> str:
    """
    Create (or verify) the shared Managed Agent environment.
    Call this ONCE during app startup if ANTHROPIC_ENVIRONMENT_ID is not set.

    Returns the environment ID.
    """
    client = get_client()

    if settings.ANTHROPIC_ENVIRONMENT_ID:
        logger.info(f"Using existing environment: {settings.ANTHROPIC_ENVIRONMENT_ID}")
        return settings.ANTHROPIC_ENVIRONMENT_ID

    logger.info("Creating new Anthropic environment (first run)...")
    env = client.beta.environments.create(
        name=f"solar-optimizer-{__import__('time').strftime('%Y%m%d%H%M%S')}",
        config={
            "type": "cloud",
            "networking": {"type": "unrestricted"},
        },
    )
    env_id = env.id
    logger.warning(
        f"\n{'='*60}\n"
        f"ENVIRONMENT CREATED: {env_id}\n"
        f"Set ANTHROPIC_ENVIRONMENT_ID={env_id} in your .env to reuse it.\n"
        f"{'='*60}"
    )
    # Update in-memory settings so this session uses it
    settings.ANTHROPIC_ENVIRONMENT_ID = env_id
    return env_id


# ─── Session management ───────────────────────────────────────────────────────

def create_session(environment_id: str, title: str = "Solar Chat") -> str:
    """
    Create a new Managed Agent session and return its ID.
    Sessions are stored in the DB by the router.
    """
    client = get_client()

    session = client.beta.sessions.create(
        agent=settings.SOLAR_AGENT_ID,       # pre-created agent ID
        environment_id=environment_id,
        title=title,
    )
    logger.info(f"Created session: {session.id}")
    return session.id


# ─── Message streaming ────────────────────────────────────────────────────────

async def stream_message(
    session_id: str,
    user_message: str,
    ha_url: str | None = None,
    ha_token: str | None = None,
) -> AsyncGenerator[str, None]:
    """
    Stream a conversation turn with the Managed Agent.

    Yields Server-Sent Event strings:
      data: {"type": "text", "content": "..."}
      data: {"type": "tool_use", "tool": "get_solar_status"}
      data: {"type": "tool_result", "tool": "get_solar_status", "result": {...}}
      data: {"type": "done"}
      data: {"type": "error", "message": "..."}

    Protocol:
      1. Open SSE stream BEFORE sending message (stream-first).
      2. Send the user message.
      3. Process events: forward text, dispatch custom tools, break on idle/terminated.
    """
    client = get_client()

    # Build context-enriched message if we have solar data
    enriched_message = user_message
    if ha_url and ha_token:
        try:
            status = await dispatch_tool("get_solar_status", {}, ha_url, ha_token)
            if "error" not in status:
                enriched_message = (
                    f"{user_message}\n\n"
                    f"[Aktuelle Anlagendaten: "
                    f"Solar {status.get('solar_power_w', 0):.0f}W, "
                    f"Batterie {status.get('battery_soc_pct', 0):.0f}%, "
                    f"Netz {status.get('grid_power_w', 0):+.0f}W, "
                    f"Verbrauch {status.get('home_consumption_w', 0):.0f}W]"
                )
        except Exception:
            pass  # Proceed without live data

    try:
        # ── Stream-first ──────────────────────────────────────────────────────
        with client.beta.sessions.events.stream(session_id=session_id) as stream:
            # Send the user message (stream is already open and buffering)
            client.beta.sessions.events.send(
                session_id=session_id,
                events=[{
                    "type": "user.message",
                    "content": [{"type": "text", "text": enriched_message}],
                }],
            )

            # Process incoming events
            for event in stream:
                event_type = event.type

                # ── Agent text output ────────────────────────────────────────
                if event_type == "agent.message":
                    for block in event.content:
                        if block.type == "text" and block.text:
                            yield _sse({"type": "text", "content": block.text})

                # ── Agent thinking (optional – pass to UI for debug) ─────────
                elif event_type == "agent.thinking":
                    yield _sse({"type": "thinking", "content": "[thinking...]"})

                # ── Built-in tool use (bash, read, web_search, …) ────────────
                elif event_type == "agent.tool_use":
                    yield _sse({"type": "tool_use", "tool": getattr(event, "name", "unknown")})

                # ── Custom tool call (MCP-style, handled by our backend) ──────
                elif event_type == "agent.custom_tool_use":
                    tool_name = event.tool_name
                    tool_input = event.input or {}
                    tool_event_id = event.id

                    yield _sse({"type": "tool_use", "tool": tool_name, "input": tool_input})

                    # Dispatch to our MCP handler
                    if ha_url and ha_token:
                        result = await dispatch_tool(tool_name, tool_input, ha_url, ha_token)
                    else:
                        result = {"error": "No Home Assistant connection configured"}

                    yield _sse({"type": "tool_result", "tool": tool_name, "result": result})

                    # Return the result to the agent
                    client.beta.sessions.events.send(
                        session_id=session_id,
                        events=[{
                            "type": "user.custom_tool_result",
                            "custom_tool_use_id": tool_event_id,
                            "content": [{"type": "text", "text": json.dumps(result)}],
                            "is_error": "error" in result,
                        }],
                    )

                # ── MCP tool use (Home Assistant MCP server – future) ─────────
                elif event_type == "agent.mcp_tool_use":
                    yield _sse({"type": "tool_use", "tool": getattr(event, "name", "mcp_tool")})

                # ── Idle – check if terminal ──────────────────────────────────
                elif event_type == "session.status_idle":
                    stop_reason = getattr(event, "stop_reason", None)
                    if stop_reason and getattr(stop_reason, "type", None) == "requires_action":
                        # Still waiting on a tool result – keep looping
                        continue
                    break

                # ── Terminated ───────────────────────────────────────────────
                elif event_type == "session.status_terminated":
                    break

                # ── Session errors ───────────────────────────────────────────
                elif event_type == "session.error":
                    error_msg = getattr(event, "message", "Session error")
                    yield _sse({"type": "error", "message": error_msg})
                    break

    except APIError as e:
        logger.error(f"Anthropic API error in stream_message: {e}")
        yield _sse({"type": "error", "message": f"API error: {e.message}"})
    except Exception as e:
        logger.exception(f"Unexpected error in stream_message")
        yield _sse({"type": "error", "message": "An unexpected error occurred"})

    yield _sse({"type": "done"})


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _sse(payload: dict) -> str:
    """Format a dict as an SSE data line."""
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"
