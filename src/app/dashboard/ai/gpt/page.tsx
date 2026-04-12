"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowRight,
  Bot,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Loader2,
  MessageSquarePlus,
  MoreHorizontal,
  Pencil,
  RotateCcw,
  Send,
  Sparkles,
  Trash2,
  User,
  Wrench,
  X,
  CheckCircle2,
  Circle,
} from "lucide-react";
import { useSession } from "next-auth/react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────

interface ToolStep {
  name: string;
  label: string;
  args: Record<string, unknown>;
  status: "running" | "done";
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  steps?: ToolStep[];
  isStreaming?: boolean;
}

interface ChatSession {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

interface SSEEvent {
  type: "text" | "tool_start" | "tool_call" | "tool_result" | "done" | "error";
  content?: string;
  tools?: string[];
  name?: string;
  args?: Record<string, unknown>;
  message?: string;
}

// ─── Constants ────────────────────────────────────────────────

const STARTER_PROMPTS = [
  "Portfolio health overview — phases, statuses, blocked projects",
  "Which projects are currently stuck or blocked?",
  "What deadlines are coming up in the next 2 weeks?",
  "Show team workload — who is overloaded?",
  "List all projects in the CHANTIER phase with their team",
  "What changed in the last 7 days?",
];

const TOOL_LABELS: Record<string, string> = {
  search_projects: "Searching project portfolio",
  get_project_details: "Fetching project details",
  get_project_thread: "Reading project thread",
  get_team_messages: "Reading team messages",
  get_agenda: "Checking agenda & deadlines",
  get_team_workload: "Analysing team workload",
  get_statistics: "Pulling portfolio statistics",
  get_activity_log: "Loading activity log",
};

const TOOL_ICONS: Record<string, string> = {
  search_projects: "🔍",
  get_project_details: "📋",
  get_project_thread: "💬",
  get_team_messages: "📢",
  get_agenda: "📅",
  get_team_workload: "👥",
  get_statistics: "📊",
  get_activity_log: "📝",
};

function generateTitle(content: string): string {
  const words = content.trim().split(/\s+/);
  const short = words.slice(0, 6).join(" ");
  return short.length < content.trim().length ? short + "…" : short;
}

// Format args for display — hide nulls/empty, humanize keys
function formatArgs(args: Record<string, unknown>): string | null {
  const visible = Object.entries(args).filter(
    ([, v]) => v !== null && v !== undefined && v !== "" && v !== false
  );
  if (!visible.length) return null;
  return visible
    .map(([k, v]) => `${k.replace(/_/g, " ")}: ${JSON.stringify(v)}`)
    .join(" · ");
}

// ─── Thinking panel ───────────────────────────────────────────

function ThinkingPanel({ steps, isStreaming }: { steps: ToolStep[]; isStreaming?: boolean }) {
  const [open, setOpen] = useState(true);
  const doneCount = steps.filter((s) => s.status === "done").length;
  const allDone = doneCount === steps.length && !isStreaming;

  if (steps.length === 0 && !isStreaming) return null;

  return (
    <div className="rounded-2xl border border-border bg-muted/40 overflow-hidden text-sm mb-2">
      {/* Header */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-muted/60 transition-colors text-left"
      >
        {isStreaming && steps.length === 0 ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground shrink-0" />
        ) : allDone ? (
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
        ) : (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500 shrink-0" />
        )}

        <span className="flex-1 text-xs font-medium text-muted-foreground">
          {isStreaming && steps.length === 0
            ? "Aria is thinking…"
            : allDone
            ? `Used ${steps.length} tool${steps.length !== 1 ? "s" : ""}`
            : `Running ${steps.length - doneCount} of ${steps.length} tools…`}
        </span>

        {steps.length > 0 && (
          open ? (
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          )
        )}
      </button>

      {/* Steps list */}
      <AnimatePresence>
        {open && steps.length > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden border-t border-border"
          >
            <div className="px-3 py-2 space-y-2">
              {steps.map((step, idx) => {
                const argsStr = formatArgs(step.args);
                return (
                  <div key={idx} className="flex items-start gap-2">
                    {/* Status icon */}
                    <div className="mt-0.5 shrink-0">
                      {step.status === "done" ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                      ) : (
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500" />
                      )}
                    </div>

                    {/* Step detail */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs">{TOOL_ICONS[step.name] ?? "🔧"}</span>
                        <span className="text-xs font-medium">{step.label}</span>
                        {step.status === "done" && (
                          <span className="text-[10px] text-emerald-600 font-medium">done</span>
                        )}
                      </div>
                      {argsStr && (
                        <p className="mt-0.5 text-[11px] text-muted-foreground truncate">
                          {argsStr}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Message bubble ───────────────────────────────────────────

function MessageBubble({
  message,
  onRetry,
}: {
  message: ChatMessage;
  onRetry?: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(() => {
    navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [message.content]);

  if (message.role === "user") {
    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex gap-3 justify-end"
      >
        <div className="max-w-[80%] rounded-[26px] px-4 py-3.5 bg-foreground text-background">
          <p className="text-sm leading-7">{message.content}</p>
        </div>
        <Avatar className="h-9 w-9 shrink-0">
          <AvatarFallback className="bg-muted text-xs">
            <User className="h-4 w-4" />
          </AvatarFallback>
        </Avatar>
      </motion.div>
    );
  }

  // Assistant message
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex gap-3 justify-start"
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-foreground text-background mt-1">
        <Bot className="h-4 w-4" />
      </div>

      <div className="flex-1 min-w-0 max-w-[90%] space-y-1">
        {/* Thinking / tool steps panel */}
        {((message.steps && message.steps.length > 0) || message.isStreaming) && (
          <ThinkingPanel steps={message.steps ?? []} isStreaming={message.isStreaming} />
        )}

        {/* Response text */}
        {message.content && (
          <div className="rounded-[26px] border border-border bg-card px-4 py-4 shadow-sm">
            <div className="prose prose-sm dark:prose-invert max-w-none text-sm leading-7 [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-border [&_td]:px-3 [&_td]:py-2 [&_th]:border [&_th]:border-border [&_th]:bg-muted [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:text-xs [&_th]:uppercase [&_th]:tracking-wide">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
            </div>
          </div>
        )}

        {/* Actions */}
        {!message.isStreaming && message.content && (
          <div className="flex items-center gap-1 px-1 pt-0.5">
            <button
              onClick={copy}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            >
              {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              {copied ? "Copied" : "Copy"}
            </button>
            {onRetry && (
              <button
                onClick={onRetry}
                className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              >
                <RotateCcw className="h-3 w-3" />
                Retry
              </button>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ─── Chat history sidebar ─────────────────────────────────────

function ChatHistorySidebar({
  sessions,
  activeId,
  onSelect,
  onNew,
  onDelete,
  onRename,
}: {
  sessions: ChatSession[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [menuId, setMenuId] = useState<string | null>(null);

  const groupByDate = (sessions: ChatSession[]) => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
    const weekAgo = new Date(today); weekAgo.setDate(weekAgo.getDate() - 7);
    const groups: Record<string, ChatSession[]> = { Today: [], Yesterday: [], "Last 7 days": [], Older: [] };
    for (const s of sessions) {
      const d = new Date(s.updatedAt); d.setHours(0, 0, 0, 0);
      if (d >= today) groups["Today"].push(s);
      else if (d >= yesterday) groups["Yesterday"].push(s);
      else if (d >= weekAgo) groups["Last 7 days"].push(s);
      else groups["Older"].push(s);
    }
    return groups;
  };

  const grouped = groupByDate(sessions);

  // Close menu on outside click
  useEffect(() => {
    if (!menuId) return;
    const handler = () => setMenuId(null);
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, [menuId]);

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-3 shrink-0">
        <button
          onClick={onNew}
          className="flex items-center gap-2 w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm font-medium hover:bg-accent transition-colors"
        >
          <MessageSquarePlus className="h-4 w-4" />
          New chat
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-3 space-y-4">
        {Object.entries(grouped).map(([label, items]) => {
          if (items.length === 0) return null;
          return (
            <div key={label}>
              <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                {label}
              </p>
              <div className="space-y-0.5">
                {items.map((s) => (
                  <div
                    key={s.id}
                    className={cn(
                      "group relative flex items-center gap-2 rounded-xl px-3 py-2.5 cursor-pointer transition-colors",
                      activeId === s.id ? "bg-accent" : "hover:bg-accent/50"
                    )}
                    onClick={() => onSelect(s.id)}
                  >
                    {editingId === s.id ? (
                      <input
                        autoFocus
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onBlur={() => {
                          if (editValue.trim()) onRename(s.id, editValue.trim());
                          setEditingId(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") { if (editValue.trim()) onRename(s.id, editValue.trim()); setEditingId(null); }
                          if (e.key === "Escape") setEditingId(null);
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="flex-1 bg-transparent text-sm outline-none border-b border-foreground"
                      />
                    ) : (
                      <span className="flex-1 truncate text-sm">{s.title}</span>
                    )}

                    <div className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity relative">
                      <button
                        onClick={(e) => { e.stopPropagation(); setMenuId(menuId === s.id ? null : s.id); }}
                        className="p-1 rounded-lg hover:bg-background transition-colors"
                      >
                        <MoreHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
                      </button>
                      {menuId === s.id && (
                        <div
                          className="absolute right-0 top-6 z-50 min-w-[130px] rounded-xl border border-border bg-card shadow-lg py-1"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            onClick={() => { setEditValue(s.title); setEditingId(s.id); setMenuId(null); }}
                            className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-accent transition-colors"
                          >
                            <Pencil className="h-3.5 w-3.5" /> Rename
                          </button>
                          <button
                            onClick={() => { onDelete(s.id); setMenuId(null); }}
                            className="flex items-center gap-2 w-full px-3 py-2 text-sm text-red-600 hover:bg-accent transition-colors"
                          >
                            <Trash2 className="h-3.5 w-3.5" /> Delete
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}

        {sessions.length === 0 && (
          <p className="px-3 pt-4 text-xs text-muted-foreground text-center">No conversations yet</p>
        )}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────

export default function DBSGPTPage() {
  const { data: userSession } = useSession();

  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingSession, setLoadingSession] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const seqRef = useRef(0);
  const pendingUserContent = useRef("");
  const pendingAssistantContent = useRef("");

  const makeId = (role: string) => `${role}-${++seqRef.current}`;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Load sessions
  useEffect(() => {
    fetch("/api/ai-chats").then((r) => r.json()).then((d: ChatSession[]) => setSessions(d)).catch(() => {});
  }, []);

  // Load messages for active session
  useEffect(() => {
    if (!activeSessionId) { setMessages([]); return; }
    setLoadingSession(true);
    fetch(`/api/ai-chats/${activeSessionId}`)
      .then((r) => r.json())
      .then((d: { messages: { id: string; role: string; content: string }[] }) => {
        setMessages((d.messages ?? []).map((m) => ({ id: m.id, role: m.role as "user" | "assistant", content: m.content })));
      })
      .catch(() => {})
      .finally(() => setLoadingSession(false));
  }, [activeSessionId]);

  const createSession = useCallback(async (): Promise<string> => {
    const res = await fetch("/api/ai-chats", { method: "POST" });
    const data = await res.json() as ChatSession;
    setSessions((prev) => [data, ...prev]);
    setActiveSessionId(data.id);
    setMessages([]);
    return data.id;
  }, []);

  const handleNew = useCallback(async () => { await createSession(); }, [createSession]);

  const handleSelect = useCallback((id: string) => { setActiveSessionId(id); }, []);

  const handleDelete = useCallback(async (id: string) => {
    await fetch(`/api/ai-chats/${id}`, { method: "DELETE" });
    setSessions((prev) => prev.filter((s) => s.id !== id));
    if (activeSessionId === id) { setActiveSessionId(null); setMessages([]); }
  }, [activeSessionId]);

  const handleRename = useCallback(async (id: string, title: string) => {
    await fetch(`/api/ai-chats/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title }) });
    setSessions((prev) => prev.map((s) => s.id === id ? { ...s, title } : s));
  }, []);

  const saveMessages = useCallback(async (sessionId: string, userContent: string, assistantContent: string, isFirst: boolean) => {
    const title = isFirst ? generateTitle(userContent) : undefined;
    await fetch(`/api/ai-chats/${sessionId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userContent, assistantContent, title }),
    });
    setSessions((prev) => prev.map((s) => s.id === sessionId
      ? { ...s, updatedAt: new Date().toISOString(), ...(title ? { title } : {}) }
      : s
    ));
  }, []);

  const buildHistory = useCallback((msgs: ChatMessage[]) =>
    msgs.filter((m) => !m.isStreaming).map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
    []
  );

  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim() || loading) return;

    let sessionId = activeSessionId;
    const isFirst = messages.length === 0;
    if (!sessionId) sessionId = await createSession();

    const userMsg: ChatMessage = { id: makeId("user"), role: "user", content };
    const assistantId = makeId("assistant");
    const assistantMsg: ChatMessage = { id: assistantId, role: "assistant", content: "", steps: [], isStreaming: true };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setInput("");
    setLoading(true);
    pendingUserContent.current = content;
    pendingAssistantContent.current = "";

    if (textareaRef.current) textareaRef.current.style.height = "auto";

    try {
      const history = buildHistory([...messages, userMsg]);
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      if (!res.body) throw new Error("No stream");

      const reader = res.body.getReader();
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
          try {
            const event: SSEEvent = JSON.parse(line.slice(6));

            if (event.type === "text" && event.content) {
              pendingAssistantContent.current += event.content;
              setMessages((prev) => prev.map((m) =>
                m.id === assistantId
                  ? { ...m, content: m.content + event.content, isStreaming: false }
                  : m
              ));
            } else if (event.type === "tool_call" && event.name) {
              // Individual tool call starting — add as a running step
              setMessages((prev) => prev.map((m) =>
                m.id === assistantId
                  ? {
                      ...m,
                      steps: [
                        ...(m.steps ?? []),
                        {
                          name: event.name!,
                          label: TOOL_LABELS[event.name!] ?? event.name!,
                          args: event.args ?? {},
                          status: "running" as const,
                        },
                      ],
                    }
                  : m
              ));
            } else if (event.type === "tool_result" && event.name) {
              // Mark the first "running" step with this tool name as done
              setMessages((prev) => prev.map((m) => {
                if (m.id !== assistantId) return m;
                let marked = false;
                const steps = (m.steps ?? []).map((s) => {
                  if (!marked && s.name === event.name && s.status === "running") {
                    marked = true;
                    return { ...s, status: "done" as const };
                  }
                  return s;
                });
                return { ...m, steps };
              }));
            } else if (event.type === "done") {
              setMessages((prev) => prev.map((m) =>
                m.id === assistantId ? { ...m, isStreaming: false } : m
              ));
            } else if (event.type === "error") {
              setMessages((prev) => prev.map((m) =>
                m.id === assistantId ? { ...m, content: `Error: ${event.message}`, isStreaming: false } : m
              ));
            }
          } catch {
            // malformed SSE line
          }
        }
      }

      if (sessionId && pendingAssistantContent.current) {
        await saveMessages(sessionId, pendingUserContent.current, pendingAssistantContent.current, isFirst);
      }
    } catch (err) {
      setMessages((prev) => prev.map((m) =>
        m.id === assistantId ? { ...m, content: `Something went wrong: ${String(err)}`, isStreaming: false } : m
      ));
    } finally {
      setLoading(false);
    }
  }, [loading, messages, activeSessionId, createSession, buildHistory, saveMessages]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(input); }
  }

  function handleTextareaChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = Math.min(e.target.scrollHeight, 140) + "px";
  }

  const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");

  return (
    <div className="flex h-[calc(100vh-64px)] bg-background">
      {/* History sidebar */}
      <div className="w-64 shrink-0 border-r border-border bg-card/50 flex flex-col overflow-hidden">
        <div className="px-4 py-3 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-foreground text-background">
              <Sparkles className="h-3.5 w-3.5" />
            </div>
            <span className="text-sm font-semibold">DBS GPT</span>
          </div>
        </div>
        <div className="flex-1 overflow-hidden">
          <ChatHistorySidebar
            sessions={sessions} activeId={activeSessionId}
            onSelect={handleSelect} onNew={handleNew}
            onDelete={handleDelete} onRename={handleRename}
          />
        </div>
      </div>

      {/* Main area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <div className="shrink-0 border-b border-border bg-card/80 px-6 py-3 backdrop-blur-sm flex items-center justify-between">
          <span className="text-sm font-medium truncate max-w-xs">
            {activeSessionId ? sessions.find((s) => s.id === activeSessionId)?.title ?? "Chat" : "DBS GPT — Aria"}
          </span>
          <div className="flex items-center gap-2">
            <Badge variant="success" className="text-xs">Live</Badge>
            <Badge variant="outline" className="text-xs">GPT-4o</Badge>
            {messages.length > 0 && (
              <Button variant="outline" size="sm" className="text-xs h-7" onClick={handleNew}>New chat</Button>
            )}
          </div>
        </div>

        {/* Messages / empty state */}
        <div className="flex-1 overflow-y-auto">
          {loadingSession ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : messages.length === 0 ? (
            <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} className="mx-auto max-w-2xl px-6 py-10">
              <div className="rounded-[28px] bg-[linear-gradient(135deg,#0f172a_0%,#1e3a8a_56%,#155e75_100%)] px-8 py-10 text-white shadow-[0_28px_70px_rgba(15,23,42,0.18)]">
                <Badge className="bg-white/12 text-[11px] text-white">Project Intelligence · Aria</Badge>
                <h2 className="mt-4 text-3xl font-semibold tracking-tight">
                  Ask anything about DBS projects, deadlines, team, or regulations.
                </h2>
              </div>
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                {STARTER_PROMPTS.map((prompt) => (
                  <button key={prompt} onClick={() => sendMessage(prompt)}
                    className="group rounded-[20px] border border-border bg-card px-4 py-4 text-left transition-colors hover:bg-accent"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-medium leading-6">{prompt}</p>
                      <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                    </div>
                  </button>
                ))}
              </div>
            </motion.div>
          ) : (
            <div className="mx-auto max-w-3xl px-6 py-6 space-y-6">
              <AnimatePresence>
                {messages.map((message, idx) => (
                  <MessageBubble
                    key={message.id}
                    message={message}
                    onRetry={
                      message.role === "assistant" && idx === messages.length - 1 && lastUserMsg
                        ? () => { setMessages((prev) => prev.slice(0, -1)); sendMessage(lastUserMsg.content); }
                        : undefined
                    }
                  />
                ))}
              </AnimatePresence>
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input */}
        <div className="shrink-0 border-t border-border bg-card/90 px-6 py-4">
          <div className="mx-auto max-w-3xl flex gap-3">
            <textarea
              ref={textareaRef}
              placeholder="Ask about projects, deadlines, team workload, regulations…"
              value={input}
              onChange={handleTextareaChange}
              onKeyDown={handleKeyDown}
              rows={1}
              className="flex-1 min-h-[52px] max-h-[140px] resize-none rounded-2xl border border-border bg-background px-4 py-3.5 text-sm outline-none focus:ring-2 focus:ring-foreground/20 transition-all"
            />
            <Button onClick={() => sendMessage(input)} disabled={!input.trim() || loading}
              size="icon" className="h-[52px] w-[52px] rounded-2xl shrink-0"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
          <p className="mx-auto max-w-3xl mt-2 text-xs text-muted-foreground">
            Enter to send · Shift+Enter for new line
          </p>
        </div>
      </div>
    </div>
  );
}
