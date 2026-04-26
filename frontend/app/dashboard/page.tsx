"use client";
/**
 * Dashboard – shows live solar data + quick links.
 */
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { dashboard as dashboardApi, DashboardOverview } from "@/lib/api";
import {
  Sun, Battery, Zap, Home, TrendingUp, Settings,
  MessageSquare, LogOut, RefreshCw, AlertCircle, ChevronRight,
} from "lucide-react";

export default function DashboardPage() {
  const { user, loading: authLoading, logout } = useAuth();
  const router = useRouter();
  const [data, setData] = useState<DashboardOverview | null>(null);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!authLoading && !user) router.push("/auth/login");
  }, [user, authLoading, router]);

  const fetchData = useCallback(async () => {
    setFetching(true);
    try {
      const overview = await dashboardApi.getOverview();
      setData(overview);
      setError("");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setFetching(false);
    }
  }, []);

  useEffect(() => {
    if (user) {
      fetchData();
      const interval = setInterval(fetchData, 30_000); // refresh every 30s
      return () => clearInterval(interval);
    }
  }, [user, fetchData]);

  if (authLoading || !user) {
    return <LoadingScreen />;
  }

  return (
    <div className="min-h-screen bg-slate-950">
      {/* Top nav */}
      <nav className="border-b border-slate-800 bg-slate-900/50 backdrop-blur sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-gradient-to-br from-amber-400 to-orange-500 rounded-lg flex items-center justify-center">
              <Sun className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-white">SolarOptimizer</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-slate-400 text-sm hidden sm:block">
              {user.full_name || user.email}
            </span>
            <button
              onClick={logout}
              className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition"
              title="Abmelden"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto px-4 py-8 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Dashboard</h1>
            <p className="text-slate-400 text-sm mt-0.5">
              {data?.demo ? "Demo-Daten – Anlage noch nicht verbunden" : "Live-Daten deiner Anlage"}
            </p>
          </div>
          <button
            onClick={fetchData}
            disabled={fetching}
            className="flex items-center gap-2 px-3 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-sm text-slate-300 transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${fetching ? "animate-spin" : ""}`} />
            Aktualisieren
          </button>
        </div>

        {/* Error banner */}
        {error && (
          <div className="flex items-center gap-3 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {error}
          </div>
        )}

        {/* Demo banner */}
        {data?.demo && (
          <div className="flex items-center justify-between bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3">
            <div className="flex items-center gap-3 text-amber-400 text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>Verbinde deine Anlage, um echte Daten zu sehen</span>
            </div>
            <Link
              href="/solar-connect"
              className="flex items-center gap-1 text-amber-400 hover:text-amber-300 text-sm font-medium"
            >
              Jetzt verbinden <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
        )}

        {/* Stats grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            icon={<Sun className="w-5 h-5 text-amber-400" />}
            label="Solar"
            value={data ? `${(data.solar_power_w / 1000).toFixed(2)} kW` : "—"}
            sub="Aktuelle Leistung"
            color="amber"
          />
          <StatCard
            icon={<Battery className="w-5 h-5 text-emerald-400" />}
            label="Batterie"
            value={data ? `${data.battery_soc_pct.toFixed(0)}%` : "—"}
            sub="Ladestand"
            color="emerald"
            progress={data?.battery_soc_pct}
          />
          <StatCard
            icon={<Zap className="w-5 h-5 text-sky-400" />}
            label="Netz"
            value={data ? `${(data.grid_power_w / 1000).toFixed(2)} kW` : "—"}
            sub={data && data.grid_power_w < 0 ? "Einspeisung" : "Bezug"}
            color="sky"
          />
          <StatCard
            icon={<Home className="w-5 h-5 text-violet-400" />}
            label="Verbrauch"
            value={data ? `${(data.home_consumption_w / 1000).toFixed(2)} kW` : "—"}
            sub="Hausverbrauch"
            color="violet"
          />
        </div>

        {/* Today's performance */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="w-4 h-4 text-emerald-400" />
              <span className="text-sm font-medium text-slate-300">Heute</span>
            </div>
            <p className="text-3xl font-bold text-white">
              {data ? `${data.daily_yield_kwh.toFixed(1)} kWh` : "—"}
            </p>
            <p className="text-sm text-slate-400 mt-1">Ertrag heute</p>
          </div>

          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-sm text-emerald-400 font-medium">CHF</span>
              <span className="text-sm font-medium text-slate-300">Einsparung</span>
            </div>
            <p className="text-3xl font-bold text-white">
              {data ? `CHF ${data.daily_savings_chf.toFixed(2)}` : "—"}
            </p>
            <p className="text-sm text-slate-400 mt-1">Geschätzte Einsparung heute</p>
          </div>
        </div>

        {/* Quick actions */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <QuickAction
            href="/agent"
            icon={<MessageSquare className="w-5 h-5" />}
            title="Agent Chat"
            desc="Frage deinen KI-Berater"
            gradient="from-sky-600 to-sky-700"
          />
          <QuickAction
            href="/solar-connect"
            icon={<Settings className="w-5 h-5" />}
            title="Anlage verbinden"
            desc="Home Assistant einrichten"
            gradient="from-emerald-600 to-emerald-700"
          />
          <QuickAction
            href="/agent"
            icon={<Zap className="w-5 h-5" />}
            title="Optimierung starten"
            desc="Batterie-Strategie optimieren"
            gradient="from-violet-600 to-violet-700"
          />
        </div>
      </main>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({
  icon, label, value, sub, color, progress,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  color: string;
  progress?: number;
}) {
  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">{label}</span>
        {icon}
      </div>
      <p className="text-2xl font-bold text-white">{value}</p>
      <p className="text-xs text-slate-500 mt-1">{sub}</p>
      {progress !== undefined && (
        <div className="mt-3 h-1.5 bg-slate-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-emerald-500 rounded-full transition-all duration-500"
            style={{ width: `${Math.min(100, progress)}%` }}
          />
        </div>
      )}
    </div>
  );
}

function QuickAction({
  href, icon, title, desc, gradient,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  desc: string;
  gradient: string;
}) {
  return (
    <Link
      href={href}
      className={`bg-gradient-to-br ${gradient} rounded-xl p-5 hover:opacity-90 transition group`}
    >
      <div className="text-white/80 mb-3">{icon}</div>
      <p className="font-semibold text-white">{title}</p>
      <p className="text-sm text-white/70 mt-0.5">{desc}</p>
    </Link>
  );
}

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950">
      <div className="w-8 h-8 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}
