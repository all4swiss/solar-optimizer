"use client";
/**
 * Solar Connection Wizard
 * Guides the user through entering their Home Assistant URL + Long-Lived Access Token.
 */
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { solar as solarApi } from "@/lib/api";
import {
  ArrowLeft, CheckCircle, AlertCircle, Wifi, Key, Server,
  ChevronRight, Loader2, Info,
} from "lucide-react";

type Step = "intro" | "url" | "token" | "details" | "verify" | "done";

export default function SolarConnectPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [step, setStep] = useState<Step>("intro");
  const [form, setForm] = useState({
    haUrl: "http://homeassistant.local:8123",
    haToken: "",
    inverterBrand: "",
    batteryKwh: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ is_verified: boolean } | null>(null);

  useEffect(() => {
    if (!authLoading && !user) router.push("/auth/login");
  }, [user, authLoading, router]);

  const handleConnect = async () => {
    setSubmitting(true);
    setError("");
    try {
      const conn = await solarApi.connect(
        form.haUrl,
        form.haToken,
        form.inverterBrand || undefined,
        form.batteryKwh ? parseFloat(form.batteryKwh) : undefined,
      );
      setResult(conn);
      setStep("done");
    } catch (e: any) {
      setError(e.message || "Verbindung fehlgeschlagen");
      setStep("url");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950">
      {/* Nav */}
      <nav className="border-b border-slate-800 bg-slate-900/50 backdrop-blur sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center gap-3">
          <Link href="/dashboard" className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <span className="font-semibold text-white">Anlage verbinden</span>
        </div>
      </nav>

      <main className="max-w-2xl mx-auto px-4 py-10">
        {/* Progress */}
        {step !== "done" && (
          <div className="flex items-center gap-2 mb-8">
            {(["intro", "url", "token", "details", "verify"] as Step[]).map((s, i) => (
              <div key={s} className="flex items-center gap-2">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition ${
                  step === s ? "bg-sky-500 text-white" :
                  ["intro", "url", "token", "details", "verify"].indexOf(step) > i
                    ? "bg-emerald-500 text-white"
                    : "bg-slate-800 text-slate-500"
                }`}>
                  {i + 1}
                </div>
                {i < 4 && <div className="flex-1 h-0.5 bg-slate-800 w-4" />}
              </div>
            ))}
          </div>
        )}

        {/* ── Step: intro ── */}
        {step === "intro" && (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-bold text-white">Solaranlage verbinden</h1>
              <p className="text-slate-400 mt-2">
                Verbinde deinen Home Assistant mit SolarOptimizer, um KI-gestützte Optimierung zu aktivieren.
              </p>
            </div>

            <div className="bg-slate-900/60 border border-slate-800 rounded-xl divide-y divide-slate-800">
              {[
                { icon: <Wifi className="w-5 h-5 text-sky-400" />, title: "Home Assistant URL", desc: "IP-Adresse oder lokaler Hostname" },
                { icon: <Key className="w-5 h-5 text-amber-400" />, title: "Long-Lived Access Token", desc: "Erstell einen in HA → Profil → Sicherheit" },
                { icon: <Server className="w-5 h-5 text-emerald-400" />, title: "Anlagen-Details (optional)", desc: "Wechselrichter-Marke, Batteriekapazität" },
              ].map(({ icon, title, desc }) => (
                <div key={title} className="flex items-center gap-4 p-4">
                  <div className="w-9 h-9 bg-slate-800 rounded-lg flex items-center justify-center flex-shrink-0">{icon}</div>
                  <div>
                    <p className="font-medium text-white text-sm">{title}</p>
                    <p className="text-xs text-slate-400">{desc}</p>
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={() => setStep("url")}
              className="w-full bg-gradient-to-r from-sky-500 to-emerald-500 text-white font-semibold py-3 rounded-xl hover:opacity-90 transition flex items-center justify-center gap-2"
            >
              Weiter <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* ── Step: url ── */}
        {step === "url" && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-bold text-white">Home Assistant URL</h2>
              <p className="text-slate-400 text-sm mt-1">Die Adresse, über die du Home Assistant erreichst</p>
            </div>

            <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-4 flex gap-3 text-sm text-blue-300">
              <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <div>
                Beispiele: <code className="bg-slate-800 px-1 rounded text-xs">http://192.168.1.100:8123</code> oder{" "}
                <code className="bg-slate-800 px-1 rounded text-xs">https://mein-ha.duckdns.org</code>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Home Assistant URL</label>
              <input
                type="url"
                value={form.haUrl}
                onChange={(e) => setForm({ ...form, haUrl: e.target.value })}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white font-mono text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 transition"
                placeholder="http://homeassistant.local:8123"
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-red-400 text-sm">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {error}
              </div>
            )}

            <div className="flex gap-3">
              <button onClick={() => setStep("intro")} className="flex-1 py-2.5 rounded-xl border border-slate-700 text-slate-300 hover:bg-slate-800 transition text-sm">
                Zurück
              </button>
              <button
                onClick={() => setStep("token")}
                disabled={!form.haUrl}
                className="flex-1 bg-sky-500 hover:bg-sky-600 disabled:opacity-50 text-white font-semibold py-2.5 rounded-xl transition flex items-center justify-center gap-2 text-sm"
              >
                Weiter <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* ── Step: token ── */}
        {step === "token" && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-bold text-white">Access Token</h2>
              <p className="text-slate-400 text-sm mt-1">Erstelle einen Long-Lived Access Token in Home Assistant</p>
            </div>

            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-2 text-sm text-slate-300">
              <p className="font-medium text-white">So erstellst du einen Token:</p>
              <ol className="space-y-1 list-decimal list-inside text-slate-400">
                <li>Öffne Home Assistant → Profil (unten links)</li>
                <li>Scrolle zu <strong className="text-slate-300">„Sicherheit"</strong></li>
                <li>Klicke <strong className="text-slate-300">„Token erstellen"</strong></li>
                <li>Namen eingeben (z.B. „SolarOptimizer") → Erstellen</li>
                <li>Token kopieren und hier einfügen</li>
              </ol>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Long-Lived Access Token</label>
              <textarea
                value={form.haToken}
                onChange={(e) => setForm({ ...form, haToken: e.target.value })}
                rows={4}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white font-mono text-xs focus:outline-none focus:ring-2 focus:ring-sky-500 transition resize-none"
                placeholder="eyJ0eXAiOiJKV1Qi..."
              />
            </div>

            <div className="flex gap-3">
              <button onClick={() => setStep("url")} className="flex-1 py-2.5 rounded-xl border border-slate-700 text-slate-300 hover:bg-slate-800 transition text-sm">
                Zurück
              </button>
              <button
                onClick={() => setStep("details")}
                disabled={!form.haToken}
                className="flex-1 bg-sky-500 hover:bg-sky-600 disabled:opacity-50 text-white font-semibold py-2.5 rounded-xl transition flex items-center justify-center gap-2 text-sm"
              >
                Weiter <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* ── Step: details ── */}
        {step === "details" && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-bold text-white">Anlagen-Details <span className="text-slate-500 text-base font-normal">(optional)</span></h2>
              <p className="text-slate-400 text-sm mt-1">Hilft dem KI-Agenten, bessere Optimierungen vorzuschlagen</p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Wechselrichter-Marke</label>
                <input
                  type="text"
                  value={form.inverterBrand}
                  onChange={(e) => setForm({ ...form, inverterBrand: e.target.value })}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-sky-500 transition"
                  placeholder="z.B. SMA, Fronius, Huawei, Kostal"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Batteriekapazität (kWh)</label>
                <input
                  type="number"
                  value={form.batteryKwh}
                  onChange={(e) => setForm({ ...form, batteryKwh: e.target.value })}
                  min="0"
                  step="0.1"
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-sky-500 transition"
                  placeholder="z.B. 10.0"
                />
              </div>
            </div>

            <div className="flex gap-3">
              <button onClick={() => setStep("token")} className="flex-1 py-2.5 rounded-xl border border-slate-700 text-slate-300 hover:bg-slate-800 transition text-sm">
                Zurück
              </button>
              <button
                onClick={() => { setStep("verify"); handleConnect(); }}
                className="flex-1 bg-gradient-to-r from-sky-500 to-emerald-500 text-white font-semibold py-2.5 rounded-xl hover:opacity-90 transition flex items-center justify-center gap-2 text-sm"
              >
                Verbinden
              </button>
            </div>
          </div>
        )}

        {/* ── Step: verify ── */}
        {step === "verify" && (
          <div className="flex flex-col items-center gap-6 py-12">
            <div className="w-16 h-16 bg-sky-500/20 rounded-full flex items-center justify-center">
              <Loader2 className="w-8 h-8 text-sky-400 animate-spin" />
            </div>
            <div className="text-center">
              <p className="text-lg font-semibold text-white">Verbinde mit Home Assistant…</p>
              <p className="text-slate-400 text-sm mt-1">Überprüfe Verbindung und Sensoren</p>
            </div>
          </div>
        )}

        {/* ── Step: done ── */}
        {step === "done" && result && (
          <div className="flex flex-col items-center gap-6 py-8 text-center">
            <div className={`w-16 h-16 rounded-full flex items-center justify-center ${result.is_verified ? "bg-emerald-500/20" : "bg-amber-500/20"}`}>
              {result.is_verified ? (
                <CheckCircle className="w-8 h-8 text-emerald-400" />
              ) : (
                <AlertCircle className="w-8 h-8 text-amber-400" />
              )}
            </div>
            <div>
              <p className="text-xl font-bold text-white">
                {result.is_verified ? "Erfolgreich verbunden!" : "Verbindung gespeichert"}
              </p>
              <p className="text-slate-400 text-sm mt-2">
                {result.is_verified
                  ? "Home Assistant ist erreichbar. Deine Live-Daten sind jetzt verfügbar."
                  : "Gespeichert. Home Assistant war nicht erreichbar – prüfe URL und Token."}
              </p>
            </div>
            <div className="flex gap-3 w-full max-w-xs">
              <Link
                href="/dashboard"
                className="flex-1 bg-slate-800 hover:bg-slate-700 text-white font-medium py-2.5 rounded-xl transition text-sm text-center"
              >
                Dashboard
              </Link>
              <Link
                href="/agent"
                className="flex-1 bg-gradient-to-r from-sky-500 to-emerald-500 text-white font-semibold py-2.5 rounded-xl hover:opacity-90 transition text-sm text-center"
              >
                Agent starten
              </Link>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
