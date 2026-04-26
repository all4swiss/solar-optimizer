"""
Agent router – manages Managed Agent sessions and SSE streaming.

Endpoints:
  POST /agent/sessions        → create a new session (stored in DB)
  GET  /agent/sessions        → list user's sessions
  POST /agent/sessions/{id}/message  → send a message (returns SSE stream)
  DELETE /agent/sessions/{id} → archive session
"""
import logging

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.agent_service import create_session, stream_message
from app.auth import get_current_user
from app.config import settings
from app.database import get_db
from app.models import AgentSession, SolarConnection, User
from app.schemas import AgentSessionCreate, AgentSessionOut, SendMessageRequest

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/agent", tags=["agent"])


@router.post("/sessions", response_model=AgentSessionOut, status_code=status.HTTP_201_CREATED)
async def new_session(
    payload: AgentSessionCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new Managed Agent session for this user."""
    env_id = settings.ANTHROPIC_ENVIRONMENT_ID
    if not env_id:
        raise HTTPException(
            status_code=503,
            detail="Anthropic environment not configured. Run setup_environment first.",
        )

    try:
        anthropic_session_id = create_session(env_id, payload.title or "Solar Chat")
    except Exception as e:
        logger.error(f"Failed to create agent session: {e}")
        raise HTTPException(status_code=503, detail=f"Could not create agent session: {str(e)}")

    session = AgentSession(
        user_id=current_user.id,
        anthropic_session_id=anthropic_session_id,
        title=payload.title or "Solar Chat",
    )
    db.add(session)
    await db.commit()
    await db.refresh(session)
    return session


@router.get("/sessions", response_model=list[AgentSessionOut])
async def list_sessions(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(AgentSession)
        .where(AgentSession.user_id == current_user.id)
        .where(AgentSession.status == "active")
        .order_by(AgentSession.created_at.desc())
    )
    return result.scalars().all()


@router.post("/sessions/{session_db_id}/message")
async def send_message(
    session_db_id: int,
    payload: SendMessageRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Send a user message and stream the agent's response as Server-Sent Events.

    The SSE stream yields JSON objects:
      {"type": "text",        "content": "..."}
      {"type": "thinking",    "content": "..."}
      {"type": "tool_use",    "tool": "get_solar_status", "input": {...}}
      {"type": "tool_result", "tool": "get_solar_status", "result": {...}}
      {"type": "done"}
      {"type": "error",       "message": "..."}
    """
    # Verify session belongs to user
    result = await db.execute(
        select(AgentSession).where(
            AgentSession.id == session_db_id,
            AgentSession.user_id == current_user.id,
        )
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Load HA credentials (optional – enhances context)
    ha_url = ha_token = None
    conn_result = await db.execute(
        select(SolarConnection).where(SolarConnection.user_id == current_user.id)
    )
    conn = conn_result.scalar_one_or_none()
    if conn:
        ha_url = conn.ha_url
        ha_token = conn.ha_token

    async def event_generator():
        async for chunk in stream_message(
            session_id=session.anthropic_session_id,
            user_message=payload.message,
            ha_url=ha_url,
            ha_token=ha_token,
        ):
            yield chunk

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@router.delete("/sessions/{session_db_id}", status_code=status.HTTP_204_NO_CONTENT)
async def archive_session(
    session_db_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(AgentSession).where(
            AgentSession.id == session_db_id,
            AgentSession.user_id == current_user.id,
        )
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    session.status = "archived"
    await db.commit()
