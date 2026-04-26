# SolarOptimizer – Claude-powered Solar Management Platform

AI-assisted solar installation management using Claude Managed Agents.

## Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 15 (App Router) + TypeScript + Tailwind CSS |
| Backend | FastAPI (Python 3.12) + SQLAlchemy 2.0 async |
| Database | PostgreSQL 16 |
| Auth | JWT (access + refresh tokens) |
| AI | Anthropic Claude Managed Agents (`agent_011CaSxh4w2LmQc3wt4EB5HU`) |
| Solar Data | Home Assistant REST API |
| Dev | Docker Compose |

---

## Quick Start (Docker Compose)

### 1. Clone and configure

```bash
git clone <repo>
cd solar-optimizer
cp .env.example .env
```

Edit `.env` — at minimum set:
```
ANTHROPIC_API_KEY=sk-ant-api03-...
JWT_SECRET_KEY=<generate with: openssl rand -hex 32>
```

### 2. One-time: create the Anthropic Environment

The Managed Agent (`agent_011CaSxh4w2LmQc3wt4EB5HU`) is pre-created.
You need an **Environment** (once per deployment):

```bash
# Option A: Auto-created on first startup (check logs for the ID)
docker compose up backend --no-deps

# Check the logs:
docker compose logs backend | grep "ENVIRONMENT CREATED"
# → ENVIRONMENT CREATED: env_01abc...

# Then set in .env:
ANTHROPIC_ENVIRONMENT_ID=env_01abc...
```

### 3. Start all services

```bash
docker compose up --build
```

- Frontend: http://localhost:3000
- Backend API: http://localhost:8000
- API docs: http://localhost:8000/docs

---

## Manual Setup (without Docker)

### Backend

```bash
cd backend

# Create virtualenv
python3.12 -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Set up environment variables
cp ../.env.example .env
# Edit .env with your values

# Start PostgreSQL (or use SQLite for testing by changing DATABASE_URL)
# DATABASE_URL=sqlite+aiosqlite:///./solar.db  (add aiosqlite to requirements.txt)

# Run migrations (auto-created on startup in dev mode)
# Or manually: alembic upgrade head

# Start the server
uvicorn app.main:app --reload --port 8000
```

### Frontend

```bash
cd frontend

npm install

# Set env
echo "NEXT_PUBLIC_API_URL=http://localhost:8000" > .env.local

npm run dev
```

Frontend: http://localhost:3000

---

## Architecture

### Managed Agents Flow

```
User browser
    │
    ▼ POST /api/v1/agent/sessions/{id}/message
FastAPI (backend)
    │
    ├─ Fetch HA live data → inject into user message as context
    │
    ▼ client.beta.sessions.stream()  ← STREAM FIRST
Anthropic Managed Agent (agent_011CaSxh4w2LmQc3wt4EB5HU)
    │
    ├─ agent.message → SSE "text" → Frontend
    ├─ agent.custom_tool_use → dispatch to HA client → SSE "tool_result"
    │     └─ get_solar_status, get_battery_soc, get_daily_yield
    └─ session.status_idle (end_turn) → SSE "done"
```

### MCP / Custom Tools

The backend acts as an **MCP intermediary**:

1. Claude agent emits `agent.custom_tool_use` with tool name + input
2. FastAPI backend intercepts and calls `app/mcp/home_assistant.py`
3. Result is sent back as `user.custom_tool_result`
4. Agent continues with the data

**Registered read-only tools:**
- `get_solar_status` – current PV power, battery SoC, grid flow, home consumption
- `get_battery_soc` – battery state of charge
- `get_daily_yield` – today's PV energy

**Write tools (guarded, future):**
- `set_battery_mode` – requires user confirmation before execution

### Future: Native MCP Server

When the Home Assistant MCP server (`ha-mcp`) is production-ready:
1. Add MCP server to agent config via `agents.update()`
2. Create a vault with HA OAuth credentials
3. Attach vault to sessions via `vault_ids`
4. Remove custom tool dispatch from backend

---

## Home Assistant Entity Requirements

The integration expects these HA sensor entities:

| Entity ID | Description | Unit |
|-----------|-------------|------|
| `sensor.solar_power` | Current PV generation | W |
| `sensor.battery_soc` | Battery state of charge | % |
| `sensor.grid_power` | Grid import/export (+ = import) | W |
| `sensor.home_consumption` | Total home load | W |
| `sensor.solar_energy_today` | Daily PV yield | kWh |

Adjust entity names in `backend/app/mcp/home_assistant.py` to match your setup.

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/auth/register` | Register new user |
| POST | `/api/v1/auth/login` | Login (returns JWT) |
| POST | `/api/v1/auth/refresh` | Refresh access token |
| GET | `/api/v1/auth/me` | Current user |
| POST | `/api/v1/solar/connect` | Save HA credentials |
| GET | `/api/v1/solar/connection` | Get saved connection |
| GET | `/api/v1/solar/status` | Live solar data |
| GET | `/api/v1/dashboard/overview` | Dashboard data |
| POST | `/api/v1/agent/sessions` | Create new chat session |
| GET | `/api/v1/agent/sessions` | List sessions |
| POST | `/api/v1/agent/sessions/{id}/message` | Send message (SSE stream) |
| DELETE | `/api/v1/agent/sessions/{id}` | Archive session |

---

## Future: Hermes Layer (Policy Optimisation)

Planned second-layer architecture using Nous Research Hermes for long-term learning:

```
Claude Agent (real-time decisions)
    ↓ logs decisions + outcomes to DB
Hermes (Nous Research) — background job
    ↓ trains on historical decision/outcome pairs
    ↓ generates updated policy recommendations
Claude Agent (improved system prompt with learned policies)
```

Implementation plan:
1. Log every agent recommendation + actual outcome (energy saved, cost delta)
2. Weekly Hermes fine-tuning run on the outcome dataset
3. Generate updated `BATTERY_POLICY` for the agent's system prompt
4. A/B test new policy vs current policy

---

## Environment Variables Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | ✅ | Anthropic API key |
| `SOLAR_AGENT_ID` | ✅ | Managed Agent ID (pre-created) |
| `ANTHROPIC_ENVIRONMENT_ID` | ✅ after first run | Reusable environment ID |
| `DATABASE_URL` | ✅ | Async PostgreSQL URL |
| `JWT_SECRET_KEY` | ✅ | Random secret for JWT signing |
| `FRONTEND_URL` | ✅ | CORS origin |
| `POSTGRES_USER/PASSWORD/DB` | Docker | PostgreSQL credentials |
