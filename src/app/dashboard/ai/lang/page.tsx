"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Loader2,
  Network,
  Send,
  User,
  Wrench,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// ─── Types (match FastAPI SyncChatResponse) ───────────────────

interface ToolCallTrace {
  name: string;
  args: Record<string, unknown>;
  result: string;
}

interface SyncResponse {
  response: string;
  duration_ms: number;
  visited_nodes: string[];
  tool_calls: ToolCallTrace[];
  iteration_count: number;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  trace?: {
    durationMs: number;
    visitedNodes: string[];
    toolCalls: ToolCallTrace[];
    iterationCount: number;
  };
  isLoading?: boolean;
  error?: string;
}

interface HealthState {
  status: "checking" | "online" | "offline";
  version?: string;
  detail?: string;
}

// ─── Starter prompts — tuned for DBS GPT tools ────────────────

const STARTER_PROMPTS = [
  "List all projects in the CHANTIER phase.",
  "What is the team assigned to Le Saillen?",
  "Give me the portfolio statistics by phase.",
  "Which projects are currently stuck?",
];

// ─── Agent label + accent ─────────────────────────────────────

const AGENT_LABELS: Record<string, { label: string; color: string }> = {
  supervisor: { label: "Supervisor", color: "bg-slate-100 text-slate-700 border-slate-200" },
  project_manager: { label: "Project Manager", color: "bg-blue-50 text-blue-700 border-blue-200" },
  scheduler: { label: "Scheduler", color: "bg-amber-50 text-amber-700 border-amber-200" },
  regulations_expert: { label: "Regulations", color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  data_analyst: { label: "Data Analyst", color: "bg-purple-50 text-purple-700 border-purple-200" },
};

function formatArgs(args: Record<string, unknown>): string {
  const entries = Object.entries(args).filter(
    ([, v]) => v !== null && v !== undefined && v !== "",
  );
  if (entries.length === 0) return "—";
  return entries.map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(" · ");
}

// ─── Trace panel ──────────────────────────────────────────────

function TracePanel({ trace }: { trace: NonNullable<ChatMessage["trace"]> }) {
  const [open, setOpen] = useState(false);
  const dedupedNodes = Array.from(new Set(trace.visitedNodes));

  return (
    <div className="mb-2 overflow-hidden rounded-2xl border border-border bg-muted/40 text-sm">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left transition-colors hover:bg-muted/60"
      >
        <Network className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="flex-1 text-xs font-medium text-muted-foreground">
          LangGraph flow · {dedupedNodes.length} agent{dedupedNodes.length !== 1 ? "s" : ""} ·{" "}
          {trace.toolCalls.length} tool call{trace.toolCalls.length !== 1 ? "s" : ""} ·{" "}
          {trace.durationMs.toFixed(0)} ms
        </span>
        {open ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden border-t border-border"
          >
            <div className="space-y-3 px-3 py-3">
              {/* Visited nodes */}
              <div>
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Routing path
                </p>
                <div className="flex flex-wrap items-center gap-1.5">
                  {trace.visitedNodes.map((node, idx) => {
                    const meta = AGENT_LABELS[node] ?? {
                      label: node,
                      color: "bg-muted text-foreground border-border",
                    };
                    return (
                      <div key={`${node}-${idx}`} className="flex items-center gap-1.5">
                        <span className={cn("rounded-full border px-2.5 py-0.5 text-[11px] font-medium", meta.color)}>
                          {meta.label}
                        </span>
                        {idx < trace.visitedNodes.length - 1 && (
                          <ArrowRight className="h-3 w-3 text-muted-foreground" />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Tool calls */}
              {trace.toolCalls.length > 0 && (
                <div>
                  <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Tool calls
                  </p>
                  <div className="space-y-2">
                    {trace.toolCalls.map((tc, idx) => (
                      <div key={idx} className="rounded-lg border border-border bg-card px-3 py-2">
                        <div className="flex items-center gap-2">
                          <Wrench className="h-3.5 w-3.5 text-muted-foreground" />
                          <code className="text-xs font-semibold">{tc.name}</code>
                        </div>
                        <p className="mt-1 break-words text-[11px] text-muted-foreground">
                          {formatArgs(tc.args)}
                        </p>
                        {tc.result && (
                          <pre className="mt-1.5 max-h-32 overflow-y-auto rounded bg-muted/50 px-2 py-1.5 text-[10px] leading-relaxed text-muted-foreground">
                            {tc.result.length > 500 ? `${tc.result.slice(0, 500)}…` : tc.result}
                          </pre>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Message bubble ───────────────────────────────────────────

function Bubble({ msg }: { msg: ChatMessage }) {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(() => {
    navigator.clipboard.writeText(msg.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [msg.content]);

  if (msg.role === "user") {
    return (
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex justify-end gap-3">
        <div className="max-w-[80%] rounded-[22px] bg-foreground px-4 py-3 text-background">
          <p className="text-sm leading-6">{msg.content}</p>
        </div>
        <Avatar className="h-9 w-9 shrink-0">
          <AvatarFallback className="bg-muted text-xs">
            <User className="h-4 w-4" />
          </AvatarFallback>
        </Avatar>
      </motion.div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex justify-start gap-3">
      <div className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-slate-900 to-indigo-900 text-white shadow-sm">
        <Network className="h-4 w-4" strokeWidth={1.75} />
      </div>
      <div className="min-w-0 max-w-[90%] flex-1 space-y-1">
        {msg.trace && <TracePanel trace={msg.trace} />}

        {msg.isLoading ? (
          <div className="inline-flex items-center gap-2 rounded-[22px] border border-border bg-card px-4 py-3 text-sm text-muted-foreground shadow-sm">
            <Loader2 className="h-4 w-4 animate-spin" />
            LangGraph is routing your question through the supervisor…
          </div>
        ) : msg.error ? (
          <div className="rounded-[22px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <p className="font-semibold">Backend error</p>
            <p className="mt-1 text-xs">{msg.error}</p>
          </div>
        ) : (
          msg.content && (
            <div className="rounded-[22px] border border-border bg-card px-4 py-4 shadow-sm">
              <div className="prose prose-sm max-w-none text-sm leading-7 dark:prose-invert">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
              </div>
            </div>
          )
        )}

        {!msg.isLoading && !msg.error && msg.content && (
          <div className="flex items-center gap-1 px-1 pt-0.5">
            <button
              onClick={copy}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ─── Page ─────────────────────────────────────────────────────

export default function LangGraphDemoPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [health, setHealth] = useState<HealthState>({ status: "checking" });
  const endRef = useRef<HTMLDivElement>(null);
  const seqRef = useRef(0);

  const nextId = () => `msg-${++seqRef.current}`;

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Poll the LangGraph backend for liveness every 10s
  useEffect(() => {
    let active = true;
    const check = async () => {
      try {
        const r = await fetch("/api/lang-agent/health", { cache: "no-store" });
        const d = (await r.json()) as { ok?: boolean; version?: string; error?: string };
        if (!active) return;
        if (d.ok) setHealth({ status: "online", version: d.version });
        else setHealth({ status: "offline", detail: d.error });
      } catch (e) {
        if (!active) return;
        setHealth({ status: "offline", detail: e instanceof Error ? e.message : String(e) });
      }
    };
    check();
    const interval = setInterval(check, 10000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || loading) return;

      const userMsg: ChatMessage = { id: nextId(), role: "user", content: trimmed };
      const assistantId = nextId();
      const placeholder: ChatMessage = { id: assistantId, role: "assistant", content: "", isLoading: true };

      setMessages((prev) => [...prev, userMsg, placeholder]);
      setInput("");
      setLoading(true);

      try {
        const res = await fetch("/api/lang-agent/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: trimmed }),
        });
        const data = (await res.json()) as Partial<SyncResponse> & { error?: string; detail?: string };

        if (!res.ok) {
          const err = data.error || `HTTP ${res.status}`;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, isLoading: false, error: data.detail ? `${err} — ${data.detail}` : err } : m,
            ),
          );
          return;
        }

        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  isLoading: false,
                  content: data.response ?? "",
                  trace: {
                    durationMs: data.duration_ms ?? 0,
                    visitedNodes: data.visited_nodes ?? [],
                    toolCalls: data.tool_calls ?? [],
                    iterationCount: data.iteration_count ?? 0,
                  },
                }
              : m,
          ),
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantId ? { ...m, isLoading: false, error: msg } : m)),
        );
      } finally {
        setLoading(false);
      }
    },
    [loading],
  );

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  };

  const healthPill =
    health.status === "online"
      ? { dot: "bg-emerald-500", label: `FastAPI online · v${health.version ?? "?"}` }
      : health.status === "offline"
      ? { dot: "bg-red-500", label: "FastAPI offline" }
      : { dot: "bg-amber-400 animate-pulse", label: "Checking backend…" };

  return (
    <div className="flex h-[calc(100vh-64px)] flex-col bg-background">
      {/* Header strip */}
      <div className="shrink-0 border-b border-border bg-card/70 px-6 py-3 backdrop-blur-sm">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Network className="h-4 w-4 text-indigo-600" />
              <h1 className="text-sm font-semibold">LangGraph Studio</h1>
              <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Python backend
              </span>
            </div>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              FastAPI · Aurora · LangGraph · Supervisor-routed sub-agents
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5">
            <span className={cn("h-1.5 w-1.5 rounded-full", healthPill.dot)} />
            <span className="text-[11px] font-medium text-muted-foreground">{healthPill.label}</span>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          <div className="mx-auto max-w-2xl px-6 py-10">
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
              <div className="rounded-[24px] bg-gradient-to-br from-slate-900 via-indigo-900 to-slate-900 px-8 py-10 text-white shadow-lg">
                <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-white/60">
                  <Network className="h-3.5 w-3.5" />
                  LangGraph supervisor
                </div>
                <h2 className="mt-4 text-2xl font-semibold leading-tight">
                  Ask something about DBS. Watch the supervisor route it to the right specialist agent.
                </h2>
                <p className="mt-3 text-sm text-white/70">
                  Every question runs through <span className="font-mono">project_manager</span>,{" "}
                  <span className="font-mono">scheduler</span>,{" "}
                  <span className="font-mono">regulations_expert</span>, or{" "}
                  <span className="font-mono">data_analyst</span> — with every tool call traced for transparency.
                </p>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {STARTER_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    onClick={() => send(prompt)}
                    className="group rounded-2xl border border-border bg-card px-4 py-3.5 text-left transition-colors hover:bg-accent"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-medium leading-6">{prompt}</p>
                      <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                    </div>
                  </button>
                ))}
              </div>
            </motion.div>
          </div>
        ) : (
          <div className="mx-auto max-w-3xl space-y-6 px-6 py-6">
            <AnimatePresence>
              {messages.map((m) => (
                <Bubble key={m.id} msg={m} />
              ))}
            </AnimatePresence>
            <div ref={endRef} />
          </div>
        )}
      </div>

      {/* Input */}
      <div className="shrink-0 border-t border-border bg-card/90 px-6 py-4">
        <div className="mx-auto flex max-w-3xl gap-3">
          <textarea
            placeholder="Ask the LangGraph supervisor…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKey}
            rows={1}
            disabled={loading || health.status === "offline"}
            className="flex-1 resize-none rounded-2xl border border-border bg-background px-4 py-3 text-sm outline-none transition-all focus:ring-2 focus:ring-foreground/20 disabled:opacity-60"
          />
          <Button
            onClick={() => send(input)}
            disabled={!input.trim() || loading || health.status === "offline"}
            size="icon"
            className="h-[46px] w-[46px] shrink-0 rounded-2xl"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
        {health.status === "offline" && (
          <p className="mx-auto mt-2 max-w-3xl text-[11px] text-red-600">
            LangGraph backend is offline. Start it with:{" "}
            <code className="rounded bg-red-50 px-1.5 py-0.5 font-mono">
              cd apps/api &amp;&amp; uv run uvicorn app.main:app --reload
            </code>
          </p>
        )}
      </div>
    </div>
  );
}
