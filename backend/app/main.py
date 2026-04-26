"""
SolarOptimizer – FastAPI Application Entry Point
─────────────────────────────────────────────────
Startup sequence:
  1. Create DB tables via SQLAlchemy (dev mode; use Alembic in production)
  2. Ensure Anthropic environment exists (creates one if ANTHROPIC_ENVIRONMENT_ID not set)
  3. Mount all routers
"""
import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import engine, Base
from app.routers import auth, solar, agent, dashboard

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger(__name__)

app = FastAPI(
    title="SolarOptimizer API",
    version="0.1.0",
    description="Claude-powered solar energy optimisation platform",
)

# ─── CORS ─────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_URL, "http://localhost:3000", "http://localhost:3002", f"http://187.124.4.181:3002"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Routers ──────────────────────────────────────────────────────────────────
app.include_router(auth.router, prefix="/api/v1")
app.include_router(solar.router, prefix="/api/v1")
app.include_router(agent.router, prefix="/api/v1")
app.include_router(dashboard.router, prefix="/api/v1")


# ─── Startup ──────────────────────────────────────────────────────────────────
@app.on_event("startup")
async def startup():
    # Auto-create tables (dev convenience; use Alembic migrations in production)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    logger.info("Database tables ready.")

    # Ensure Anthropic environment exists
    from app.agent_service import setup_environment
    try:
        env_id = await setup_environment()
        logger.info(f"Anthropic environment: {env_id}")
    except Exception as e:
        logger.warning(f"Could not set up Anthropic environment: {e}")


# ─── Health check ─────────────────────────────────────────────────────────────
@app.get("/health")
async def health():
    return {"status": "ok", "service": "SolarOptimizer API"}


@app.get("/")
async def root():
    return {"message": "SolarOptimizer API v0.1 – see /docs"}
