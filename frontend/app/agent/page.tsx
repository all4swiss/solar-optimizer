"use client";
/**
 * Agent Chat Interface
 * ─────────────────────
 * Uses SSE streaming from the FastAPI backend to display the
 * Claude Managed Agent's responses in real-time.
 *
 * SSE event shapes (from backend):
 *   {"type": "text",        "content": "..."}   → append to assistant message
 *   {"type": "thinking",    "content": "..."}   → show as debug badge
 *   {"type": "tool_use",    "tool": "...", "input": {...}}  → show tool badge
 *   {"type": "tool_result", "tool": "...", "result": {...}} → show result badge
 *   {"type": "done"}                            → finalize message
 *   {"type": "error",       "message": "..."}  → show error
 */
import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { agent as agentApi, AgentSessionOut } from "@/lib/api";
import {
  Send, ArrowLeft, Plus, MessageSquare, Settings2, Zap,
  Sun, Terminal, Loader2, AlertCircle, Wrench,
} from "lucide-react";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
  toolEvents?: ToolEvent[];
  error?: string;
}

interface ToolEvent {
  type: "use" | "result";
  tool: string;
  detail?: string;
}

export default function AgentPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [sessions, setSessions] = useState<AgentSessionOut[]>([]);
  const [activeSession, setActiveSession] = useState<AgentSessionOut | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [showDebug, setShowDebug] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!authLoading && !user) router.push("/auth/login");
  }, [user, authLoading, router]);

  // Load sessions on mount
  useEffect(() => {
    if (user) {
      agentApi.listSessions()
        .then(setSessions)
        .catch(console.error)
        .finally(() => setLoadingSessions(false));
    }
  }, [user]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const createSession = async () => {
    try {
      const session = await agentApi.createSession("Solar Optimierung");
      setSessions((prev) => [session, ...prev]);
      setActiveSession(session);
      setMessages([{
        id: "welcome",
        role: "assistant",
        content: "Hallo! Ich bin dein KI-Solarberater. Ich kann deine Anlage analysieren, Optimierungsvorschläge machen und deine Batteriestrategie verbessern. Was möchtest du wissen?",
      }]);
    } catch (e: any) {
      alert(`Fehler: ${e.message}`);
    }
  };

  const selectSession = async (session: AgentSessionOut) => {
    setActiveSession(session);
    setMessages([{
      id: "welcome",
      role: "assistant",
      content: "Chat fortgesetzt. Was kann ich für dich tun?",
    }]);
  };

  const sendMessage = useCallback(async () => {
    if (!input.trim() || !activeSession || sending) return;

    const userMessage = input.trim();
    setInput("");
    setSending(true);

    // Add user message
    const userMsgId = `user-${Date.now()}`;
    setMessages((prev) => [...prev, {
      id: userMsgId,
      role: "user",
      content: userMessage,
    }]);

    // Add placeholder for assistant response
    const assistantMsgId = `assistant-${Date.now()}`;
    setMessages((prev) => [...prev, {
      id: assistantMsgId,
      role: "assistant",
      content: "",
      streaming: true,
      toolEvents: [],
    }]);

    try {
      const response = await agentApi.sendMessageStream(activeSession.id, userMessage);

      if (!response.body) throw new Error("No response body");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const raw = line.slice(6).trim();
          if (!raw) continue;

          try {
            const event = JSON.parse(raw);
            handleSSEEvent(event, assistantMsgId);
          } catch {}
        }
      }
    } catch (e: any) {
      setMessages((prev) => prev.map((m) =>
        m.id === assistantMsgId
          ? { ...m, streaming: false, error: e.message || "Fehler beim Senden" }
          : m
      ));
    } finally {
      setSending(false);
      setMessages((prev) => prev.map((m) =>
        m.id === assistantMsgId ? { ...m, streaming: false } : m
      ));
    }
  }, [input, activeSession, sending]);

  function handleSSEEvent(event: any, msgId: string) {
    setMessages((prev) => prev.map((m) => {
      if (m.id !== msgId) return m;

      switch (event.type) {
        case "text":
          return { ...m, content: m.content + event.content };

        case "tool_use":
          return {
            ...m,
            toolEvents: [...(m.toolEvents ?? []), {
              type: "use" as const,
              tool: event.tool,
              detail: event.input ? JSON.stringify(event.input) : undefined,
            }],
          };

        case "tool_result":
          return {
            ...m,
            toolEvents: [...(m.toolEvents ?? []), {
              type: "result" as const,
              tool: event.tool,
              detail: JSON.stringify(event.result),
            }],
          };

        case "error":
          return { ...m, error: event.message, streaming: false };

        case "done":
          return { ...m, streaming: false };

        default:
          return m;
      }
    }));
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  if (authLoading) {
    return <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <Loader2 className="w-6 h-6 text-sky-400 animate-spin" />
    </div>;
  }

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col">
      {/* Top nav */}
      <nav className="border-b border-slate-800 bg-slate-900/50 backdrop-blur sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition">
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 bg-gradient-to-br from-sky-500 to-emerald-500 rounded-lg flex items-center justify-center">
                <Zap className="w-4 h-4 text-white" />
              </div>
              <span className="font-semibold text-white">Solar Agent</span>
            </div>
          </div>
          <button
            onClick={() => setShowDebug(!showDebug)}
            className={`p-2 rounded-lg transition text-sm flex items-center gap-1.5 ${showDebug ? "bg-slate-700 text-white" : "hover:bg-slate-800 text-slate-400"}`}
          >
            <Terminal className="w-4 h-4" />
            <span className="hidden sm:block">Debug</span>
          </button>
        </div>
      </nav>

      <div className="flex flex-1 max-w-6xl mx-auto w-full">
        {/* Sidebar – sessions */}
        <aside className="hidden md:flex flex-col w-64 border-r border-slate-800 p-4 gap-3">
          <button
            onClick={createSession}
            className="flex items-center gap-2 px-3 py-2 bg-sky-500/20 hover:bg-sky-500/30 border border-sky-500/30 rounded-lg text-sky-400 text-sm font-medium transition"
          >
            <Plus className="w-4 h-4" />
            Neuer Chat
          </button>

          <div className="flex-1 overflow-y-auto space-y-1">
            {loadingSessions ? (
              <div className="flex justify-center py-4">
                <Loader2 className="w-4 h-4 text-slate-500 animate-spin" />
              </div>
            ) : sessions.length === 0 ? (
              <p className="text-xs text-slate-500 text-center py-4">Noch keine Chats</p>
            ) : (
              sessions.map((s) => (
                <button
                  key={s.id}
                  onClick={() => selectSession(s)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm transition ${
                    activeSession?.id === s.id
                      ? "bg-slate-700 text-white"
                      : "text-slate-400 hover:bg-slate-800 hover:text-white"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <MessageSquare className="w-3.5 h-3.5 flex-shrink-0" />
                    <span className="truncate">{s.title}</span>
                  </div>
                </button>
              ))
            )}
          </div>
        </aside>

        {/* Main chat */}
        <div className="flex-1 flex flex-col min-h-0">
          {!activeSession ? (
            // Empty state
            <div className="flex-1 flex flex-col items-center justify-center gap-6 p-8">
              <div className="w-16 h-16 bg-gradient-to-br from-sky-500/20 to-emerald-500/20 border border-sky-500/30 rounded-2xl flex items-center justify-center">
                <Sun className="w-8 h-8 text-sky-400" />
              </div>
              <div className="text-center max-w-sm">
                <h2 className="text-xl font-bold text-white">Solar Agent</h2>
                <p className="text-slate-400 text-sm mt-2">
                  Dein persönlicher KI-Berater für Solaroptimierung. Powered by Claude.
                </p>
              </div>
              <div className="grid grid-cols-1 gap-2 w-full max-w-sm">
                {[
                  "Wie ist meine aktuelle Solarleistung?",
                  "Optimiere meine Batteriestrategie",
                  "Analysiere mein Verbrauchsmuster",
                ].map((prompt) => (
                  <button
                    key={prompt}
                    onClick={() => { createSession().then(() => setInput(prompt)); }}
                    className="text-left px-4 py-3 bg-slate-800/60 hover:bg-slate-700 border border-slate-700 rounded-xl text-sm text-slate-300 transition"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
              <button
                onClick={createSession}
                className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-sky-500 to-emerald-500 text-white font-semibold rounded-xl hover:opacity-90 transition"
              >
                <Plus className="w-4 h-4" />
                Chat starten
              </button>
            </div>
          ) : (
            <>
              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.map((msg) => (
                  <div key={msg.id} className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
                    {/* Avatar */}
                    <div className={`w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center ${
                      msg.role === "user"
                        ? "bg-sky-500"
                        : "bg-gradient-to-br from-sky-600 to-emerald-600"
                    }`}>
                      {msg.role === "user" ? (
                        <span className="text-xs font-bold text-white">
                          {user?.email?.[0]?.toUpperCase() ?? "U"}
                        </span>
                      ) : (
                        <Zap className="w-4 h-4 text-white" />
                      )}
                    </div>

                    <div className={`flex flex-col gap-2 max-w-[75%] ${msg.role === "user" ? "items-end" : "items-start"}`}>
                      {/* Tool events (debug) */}
                      {showDebug && msg.toolEvents && msg.toolEvents.length > 0 && (
                        <div className="space-y-1">
                          {msg.toolEvents.map((te, i) => (
                            <div key={i} className={`flex items-center gap-2 px-2 py-1 rounded-lg text-xs ${
                              te.type === "use"
                                ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                                : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                            }`}>
                              <Wrench className="w-3 h-3 flex-shrink-0" />
                              <span className="font-mono">{te.tool}</span>
                              {te.type === "use" ? " →" : " ✓"}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Message bubble */}
                      <div className={`px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
                        msg.role === "user"
                          ? "bg-sky-600 text-white rounded-tr-sm"
                          : "bg-slate-800 text-slate-100 rounded-tl-sm"
                      } ${msg.error ? "border border-red-500/30" : ""}`}>
                        {msg.error ? (
                          <span className="flex items-center gap-2 text-red-400">
                            <AlertCircle className="w-4 h-4" />
                            {msg.error}
                          </span>
                        ) : msg.content ? (
                          msg.content
                        ) : msg.streaming ? (
                          <span className="flex items-center gap-2 text-slate-400">
                            <span className="flex gap-1">
                              {[0, 1, 2].map((i) => (
                                <span key={i} className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: `${i * 150}ms` }} />
                              ))}
                            </span>
                            Verarbeite…
                          </span>
                        ) : null}
                        {msg.streaming && msg.content && <span className="animate-pulse">▋</span>}
                      </div>
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>

              {/* Input bar */}
              <div className="border-t border-slate-800 p-4">
                <div className="flex items-end gap-3 bg-slate-800 rounded-xl px-4 py-3">
                  <textarea
                    ref={textareaRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    disabled={sending}
                    rows={1}
                    className="flex-1 bg-transparent text-white text-sm resize-none focus:outline-none placeholder-slate-500 max-h-32"
                    placeholder="Frag deinen Solar-Agent… (Enter = Senden)"
                    style={{ minHeight: "24px" }}
                  />
                  <button
                    onClick={sendMessage}
                    disabled={!input.trim() || sending}
                    className="w-8 h-8 bg-gradient-to-br from-sky-500 to-emerald-500 disabled:opacity-30 rounded-lg flex items-center justify-center flex-shrink-0 transition hover:opacity-90"
                  >
                    {sending ? (
                      <Loader2 className="w-4 h-4 text-white animate-spin" />
                    ) : (
                      <Send className="w-4 h-4 text-white" />
                    )}
                  </button>
                </div>
                <p className="text-xs text-slate-600 text-center mt-2">
                  Agent ID: {activeSession.anthropic_session_id.slice(0, 20)}…
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
