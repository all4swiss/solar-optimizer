/**
 * API client – thin wrapper around fetch.
 * Reads JWT from localStorage, handles token refresh automatically.
 */

// Always use relative path — Next.js rewrites proxy /api/v1/* to the backend.
const API_BASE = "/api/v1";

// ─── Token management ─────────────────────────────────────────────────────────

export const tokenStore = {
  getAccess: () => (typeof window !== "undefined" ? localStorage.getItem("access_token") : null),
  getRefresh: () => (typeof window !== "undefined" ? localStorage.getItem("refresh_token") : null),
  set: (access: string, refresh: string) => {
    localStorage.setItem("access_token", access);
    localStorage.setItem("refresh_token", refresh);
  },
  clear: () => {
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
  },
};

// ─── Core fetch wrapper ───────────────────────────────────────────────────────

async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
  retry = true,
): Promise<T> {
  const token = tokenStore.getAccess();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  // Auto-refresh on 401
  if (res.status === 401 && retry) {
    const refreshToken = tokenStore.getRefresh();
    if (refreshToken) {
      try {
        const refreshRes = await fetch(`${API_BASE}/auth/refresh`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refresh_token: refreshToken }),
        });
        if (refreshRes.ok) {
          const data = await refreshRes.json();
          tokenStore.set(data.access_token, data.refresh_token);
          return apiFetch<T>(path, options, false);
        }
      } catch {}
    }
    tokenStore.clear();
    window.location.href = "/auth/login";
    throw new Error("Session expired");
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Request failed");
  }

  if (res.status === 204) return undefined as T;
  return res.json() as T;
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export const auth = {
  register: (email: string, password: string, fullName?: string) =>
    apiFetch<{ access_token: string; refresh_token: string }>("/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password, full_name: fullName }),
    }),

  login: (email: string, password: string) =>
    apiFetch<{ access_token: string; refresh_token: string }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  me: () =>
    apiFetch<{ id: number; email: string; full_name: string | null }>("/auth/me"),
};

// ─── Solar ────────────────────────────────────────────────────────────────────

export const solar = {
  connect: (haUrl: string, haToken: string, inverterBrand?: string, batteryKwh?: number) =>
    apiFetch<SolarConnectionOut>("/solar/connect", {
      method: "POST",
      body: JSON.stringify({
        ha_url: haUrl,
        ha_token: haToken,
        inverter_brand: inverterBrand,
        battery_capacity_kwh: batteryKwh,
      }),
    }),

  getConnection: () => apiFetch<SolarConnectionOut>("/solar/connection"),

  getLiveStatus: () => apiFetch<SolarStatus>("/solar/status"),

  deleteConnection: () => apiFetch<void>("/solar/connection", { method: "DELETE" }),
};

// ─── Dashboard ────────────────────────────────────────────────────────────────

export const dashboard = {
  getOverview: () => apiFetch<DashboardOverview>("/dashboard/overview"),
};

// ─── Agent ────────────────────────────────────────────────────────────────────

export const agent = {
  createSession: (title?: string) =>
    apiFetch<AgentSessionOut>("/agent/sessions", {
      method: "POST",
      body: JSON.stringify({ title }),
    }),

  listSessions: () => apiFetch<AgentSessionOut[]>("/agent/sessions"),

  // Returns a ReadableStream (SSE) – caller consumes it
  streamMessage: (sessionDbId: number, message: string): EventSource => {
    const token = tokenStore.getAccess();
    // Use EventSource for SSE – but it doesn't support POST.
    // We use fetch + ReadableStream instead.
    throw new Error("Use sendMessage() for streaming");
  },

  sendMessageStream: async (
    sessionDbId: number,
    message: string,
  ): Promise<Response> => {
    const token = tokenStore.getAccess();
    return fetch(`${API_BASE}/agent/sessions/${sessionDbId}/message`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ message }),
    });
  },

  deleteSession: (sessionDbId: number) =>
    apiFetch<void>(`/agent/sessions/${sessionDbId}`, { method: "DELETE" }),
};

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SolarConnectionOut {
  id: number;
  ha_url: string;
  is_verified: boolean;
  inverter_brand: string | null;
  battery_capacity_kwh: number | null;
  created_at: string;
}

export interface SolarStatus {
  solar_power_w: number;
  battery_soc_pct: number;
  grid_power_w: number;
  home_consumption_w: number;
  daily_yield_kwh: number;
  daily_savings_chf: number;
  timestamp: string;
}

export interface DashboardOverview extends SolarStatus {
  has_connection: boolean;
  is_verified: boolean;
  inverter_brand: string | null;
  battery_capacity_kwh: number | null;
  last_updated: string;
  demo?: boolean;
  error?: string;
}

export interface AgentSessionOut {
  id: number;
  anthropic_session_id: string;
  title: string;
  status: string;
  created_at: string;
}
