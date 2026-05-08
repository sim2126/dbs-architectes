"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { I } from "@/components/friday/icons";
import { Avatar } from "@/components/friday/avatar";
import { Skeleton } from "@/components/friday/skeleton";
import { showToast } from "@/components/toast";
import { BlocksView } from "@/components/agent-blocks";
import type { Block } from "@/lib/agent/blocks";
import type { AiArtifact, PersistedToolStep } from "@/lib/agent/artifacts";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────
type ToolStep = PersistedToolStep;

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  steps?: ToolStep[];
  artifacts?: AiArtifact[];
  blocks?: Block[];
  isStreaming?: boolean;
  error?: string;
}

interface ChatSession {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

interface SSEEvent {
  type:
    | "text"
    | "tool_start"
    | "tool_call"
    | "tool_result"
    | "artifact"
    | "blocks"
    | "done"
    | "error";
  content?: string;
  name?: string;
  args?: Record<string, unknown>;
  message?: string;
  artifact?: AiArtifact;
  blocks?: Block[];
  toolCallId?: string;
  result?: string;
}

const TOOL_LABELS: Record<string, string> = {
  search_projects: "Searching projects",
  get_project_details: "Fetching project details",
  get_project_thread: "Reading thread",
  get_team_messages: "Reading messages",
  get_agenda: "Checking agenda",
  get_team_workload: "Analysing workload",
  get_statistics: "Pulling statistics",
  get_activity_log: "Loading activity",
};

const STARTERS = [
  { icon: "chart", text: "Portfolio stats by phase" },
  { icon: "users", text: "Who is on Le Saillen?" },
  { icon: "calendar", text: "What deadlines are coming up in 2 weeks?" },
  { icon: "alert", text: "Which projects are stuck?" },
] as const;

function makeId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// ─── Aria mark ────────────────────────────────────────────────────
function AriaMark({ size = 48 }: { size?: number }) {
  const id = `aria-${size}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      aria-label="Aria"
    >
      <defs>
        <linearGradient id={`${id}-bg`} x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#0f172a" />
          <stop offset="56%" stopColor="#1e3a8a" />
          <stop offset="100%" stopColor="#155e75" />
        </linearGradient>
        <linearGradient id={`${id}-stroke`} x1="10" y1="11" x2="54" y2="52" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#93c5fd" />
          <stop offset="100%" stopColor="#22d3ee" />
        </linearGradient>
        <radialGradient id={`${id}-glow`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#bfdbfe" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#60a5fa" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="64" height="64" rx="14" fill={`url(#${id}-bg)`} />
      <rect x="0.5" y="0.5" width="63" height="63" rx="13.5" fill="none" stroke="white" strokeOpacity="0.06" strokeWidth="1" />
      <circle cx="32" cy="11" r="10" fill={`url(#${id}-glow)`} />
      <line x1="32" y1="11" x2="10" y2="52" stroke={`url(#${id}-stroke)`} strokeWidth="2.8" strokeLinecap="round" />
      <line x1="32" y1="11" x2="54" y2="52" stroke={`url(#${id}-stroke)`} strokeWidth="2.8" strokeLinecap="round" />
      <line x1="19" y1="35" x2="45" y2="35" stroke={`url(#${id}-stroke)`} strokeWidth="2.2" strokeLinecap="round" />
      <circle cx="32" cy="11" r="4.5" fill="#1e3a8a" />
      <circle cx="32" cy="11" r="3" fill="#60a5fa" />
      <circle cx="32" cy="11" r="1.6" fill="white" />
      <circle cx="10" cy="52" r="2.5" fill="#22d3ee" fillOpacity="0.65" />
      <circle cx="54" cy="52" r="2.5" fill="#22d3ee" fillOpacity="0.65" />
      <circle cx="19" cy="35" r="2" fill="#93c5fd" fillOpacity="0.55" />
      <circle cx="45" cy="35" r="2" fill="#93c5fd" fillOpacity="0.55" />
    </svg>
  );
}

// ─── Date helpers ─────────────────────────────────────────────────
function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function sessionGroup(updatedAt: string): "today" | "yesterday" | "week" | "older" {
  const now = startOfDay(new Date());
  const d = startOfDay(new Date(updatedAt));
  const diff = Math.round((now.getTime() - d.getTime()) / 86400000);
  if (diff <= 0) return "today";
  if (diff === 1) return "yesterday";
  if (diff < 7) return "week";
  return "older";
}

// ─── Sidebar ──────────────────────────────────────────────────────
function SessionRow({
  session,
  active,
  onSelect,
  onRename,
  onDelete,
}: {
  session: ChatSession;
  active: boolean;
  onSelect: () => void;
  onRename: (next: string) => void;
  onDelete: () => void;
}) {
  const [hover, setHover] = React.useState(false);
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(session.title);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const menuRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => setDraft(session.title), [session.title]);

  React.useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  React.useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node))
        setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen]);

  const commit = () => {
    setEditing(false);
    if (draft.trim() && draft.trim() !== session.title) onRename(draft.trim());
    else setDraft(session.title);
  };

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className="relative"
    >
      <button
        type="button"
        onClick={onSelect}
        className={cn(
          "flex items-center w-full px-4 py-1.5 border-0 cursor-pointer text-left text-[12px] transition-colors duration-150",
          active
            ? "bg-friday-surface-2 text-friday-fg font-medium"
            : "bg-transparent text-friday-fg-muted hover:bg-friday-surface hover:text-friday-fg",
        )}
      >
        {editing ? (
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commit();
              } else if (e.key === "Escape") {
                setDraft(session.title);
                setEditing(false);
              }
            }}
            onClick={(e) => e.stopPropagation()}
            className="w-full bg-friday-bg border border-friday-accent rounded-[3px] px-1.5 py-px text-[12px] text-friday-fg outline-none"
            style={{ boxShadow: "0 0 0 3px var(--friday-accent-ring)" }}
          />
        ) : (
          <span className="flex-1 truncate">{session.title}</span>
        )}
      </button>
      {!editing ? (
        <div ref={menuRef} className="absolute top-1 right-2">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen((v) => !v);
            }}
            aria-label="More"
            className="bg-transparent border-0 p-1 cursor-pointer text-friday-fg-muted leading-none rounded-sm"
            style={{ opacity: hover || menuOpen ? 1 : 0 }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="6" cy="12" r="1.5" />
              <circle cx="12" cy="12" r="1.5" />
              <circle cx="18" cy="12" r="1.5" />
            </svg>
          </button>
          {menuOpen ? (
            <div
              className="absolute z-30 right-0 top-6 min-w-[140px] bg-friday-surface border border-friday-border rounded p-1"
              style={{ boxShadow: "0 8px 24px rgba(20,18,12,0.14)" }}
            >
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  setEditing(true);
                }}
                className="block w-full text-left px-2 py-1.5 rounded-sm bg-transparent border-0 cursor-pointer text-[11.5px] text-friday-fg hover:bg-friday-surface-2"
              >
                Rename
              </button>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  onDelete();
                }}
                className="block w-full text-left px-2 py-1.5 rounded-sm bg-transparent border-0 cursor-pointer text-[11.5px] hover:bg-friday-surface-2"
                style={{ color: "#9b2c1a" }}
              >
                Delete
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function ChatSidebar({
  sessions,
  activeId,
  onSelect,
  onNew,
  onRename,
  onDelete,
}: {
  sessions: ChatSession[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
}) {
  const [q, setQ] = React.useState("");

  const groups = React.useMemo(() => {
    const filtered = q.trim()
      ? sessions.filter((s) =>
          s.title.toLowerCase().includes(q.toLowerCase()),
        )
      : sessions;
    const g: Record<string, ChatSession[]> = {
      today: [],
      yesterday: [],
      week: [],
      older: [],
    };
    filtered.forEach((s) => g[sessionGroup(s.updatedAt)].push(s));
    return [
      { id: "today", label: "Today", items: g.today },
      { id: "yesterday", label: "Yesterday", items: g.yesterday },
      { id: "week", label: "Last 7 days", items: g.week },
      { id: "older", label: "Older", items: g.older },
    ].filter((sec) => sec.items.length > 0);
  }, [q, sessions]);

  return (
    <div className="w-[280px] shrink-0 border-r border-friday-border-soft bg-friday-bg flex flex-col h-full">
      <div className="p-3">
        <button
          type="button"
          onClick={onNew}
          className="flex items-center gap-2 w-full h-9 px-3 bg-friday-surface-2 border border-friday-border rounded text-[12.5px] text-friday-fg font-medium cursor-pointer text-left hover:border-friday-fg transition-colors duration-150"
        >
          <I.Plus size={13} /> New chat
        </button>
      </div>
      <div className="px-3 pb-2.5">
        <div className="relative">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none leading-none">
            <I.Search size={11} className="text-friday-fg-muted" />
          </span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search chats…"
            className="w-full h-7 pl-7 pr-2 border border-friday-border-soft rounded-[3px] bg-friday-surface text-[11.5px] text-friday-fg outline-none focus:border-friday-border"
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto pb-3">
        {groups.length === 0 ? (
          <div className="px-4 py-6 text-center text-[11.5px] text-friday-fg-subtle">
            {sessions.length === 0
              ? "No chats yet."
              : `No chats match "${q}".`}
          </div>
        ) : (
          groups.map((sec) => (
            <div key={sec.id}>
              <div className="px-4 pt-2.5 pb-1 text-[9.5px] tracking-[0.18em] uppercase text-friday-fg-subtle font-medium">
                {sec.label}
              </div>
              {sec.items.map((s) => (
                <SessionRow
                  key={s.id}
                  session={s}
                  active={s.id === activeId}
                  onSelect={() => onSelect(s.id)}
                  onRename={(title) => onRename(s.id, title)}
                  onDelete={() => onDelete(s.id)}
                />
              ))}
            </div>
          ))
        )}
      </div>
      <div className="px-4 py-2.5 border-t border-friday-border-soft font-mono text-[9.5px] text-friday-fg-subtle flex items-center gap-1.5">
        <kbd
          className="font-mono text-[9.5px] text-friday-fg-muted px-1 rounded-[2px] bg-friday-surface"
          style={{ border: "1px solid var(--friday-border-soft)" }}
        >
          ⌘K
        </kbd>
        <span>open command palette</span>
      </div>
    </div>
  );
}

// ─── Welcome state ────────────────────────────────────────────────
function StarterIcon({ kind }: { kind: (typeof STARTERS)[number]["icon"] }) {
  if (kind === "chart") return <I.Chart size={13} className="text-friday-fg-muted" />;
  if (kind === "users") return <I.Users size={13} className="text-friday-fg-muted" />;
  if (kind === "calendar")
    return <I.Calendar size={13} className="text-friday-fg-muted" />;
  return <I.AlertSmall size={13} className="text-friday-fg-muted" />;
}

function Welcome({ onPick }: { onPick: (q: string) => void }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-7 pb-10">
      <div className="mb-4">
        <AriaMark size={64} />
      </div>
      <h1 className="font-display italic font-medium text-[34px] text-friday-fg m-0 -tracking-[0.5px] leading-tight">
        Aria, your DBS GPT.
      </h1>
      <p
        className="text-friday-fg-muted m-0 mt-2 text-[14px] text-center max-w-[460px]"
        style={{ fontFamily: "var(--font-friday-serif), Georgia, serif" }}
      >
        Ask anything about projects, people, deadlines, or the studio's
        portfolio. I'll read the data and give you a grounded answer.
      </p>
      <div className="mt-7 grid grid-cols-2 gap-2.5 max-w-[640px] w-full">
        {STARTERS.map((s) => (
          <button
            key={s.text}
            type="button"
            onClick={() => onPick(s.text)}
            className="flex items-center gap-2.5 px-4 py-3 bg-friday-surface border border-friday-border-soft rounded-md cursor-pointer text-left text-[13px] text-friday-fg hover:border-friday-border hover:bg-friday-surface-2 transition-colors duration-150"
          >
            <StarterIcon kind={s.icon} />
            <span>{s.text}</span>
            <span className="flex-1" />
            <I.ArrowRight size={11} className="text-friday-fg-subtle" />
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Message renderers ────────────────────────────────────────────
function UserMessage({ content }: { content: string }) {
  return (
    <div className="flex justify-end">
      <div
        className="max-w-[640px] px-4 py-2.5 rounded-md bg-friday-fg text-friday-bg text-[13px] leading-relaxed"
        style={{ borderTopRightRadius: 4 }}
      >
        {content}
      </div>
    </div>
  );
}

function ThinkingTrace({ steps }: { steps: ToolStep[] }) {
  if (!steps || steps.length === 0) return null;
  const running = steps.find((s) => s.status === "running");
  return (
    <div className="flex items-center gap-2 text-[11.5px] text-friday-fg-muted -mt-1.5 mb-1">
      <Skeleton w={6} h={6} rounded={999} className="opacity-70" />
      <span className="italic">
        {running
          ? TOOL_LABELS[running.name] ?? running.name
          : "Thinking…"}
        {steps.length > 1 ? ` · ${steps.length} steps` : null}
      </span>
    </div>
  );
}

function AssistantMessage({
  msg,
  onSave,
}: {
  msg: ChatMessage;
  onSave: (msg: ChatMessage) => void;
}) {
  return (
    <div className="flex gap-3">
      <div className="shrink-0 mt-0.5">
        <AriaMark size={28} />
      </div>
      <div className="flex-1 min-w-0">
        {msg.steps && msg.steps.length > 0 && msg.isStreaming ? (
          <ThinkingTrace steps={msg.steps} />
        ) : null}

        {msg.blocks && msg.blocks.length > 0 ? (
          <div className="flex flex-col gap-3">
            <BlocksView blocks={msg.blocks} />
          </div>
        ) : msg.content ? (
          <p
            className="text-friday-fg leading-relaxed m-0 whitespace-pre-wrap"
            style={{
              fontFamily: "var(--font-friday-serif), Georgia, serif",
              fontSize: 14,
              lineHeight: 1.65,
            }}
          >
            {msg.content}
            {msg.isStreaming ? (
              <span className="inline-block w-1.5 h-3.5 ml-1 align-middle bg-friday-fg-muted animate-pulse" />
            ) : null}
          </p>
        ) : msg.isStreaming ? (
          <ThinkingTrace steps={msg.steps ?? []} />
        ) : null}

        {msg.error ? (
          <p className="text-[12px] mt-2" style={{ color: "#9b2c1a" }}>
            {msg.error}
          </p>
        ) : null}

        {!msg.isStreaming && (msg.content || (msg.blocks?.length ?? 0) > 0) ? (
          <div className="flex items-center gap-2 mt-3">
            <button
              type="button"
              onClick={() => onSave(msg)}
              className="inline-flex items-center gap-1.5 h-7 px-2.5 bg-transparent border border-friday-border-soft rounded-[3px] cursor-pointer text-[11px] text-friday-fg-muted hover:text-friday-fg hover:border-friday-border"
            >
              <I.Star size={11} />
              Save
            </button>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard
                  ?.writeText(msg.content || "")
                  .catch(() => undefined);
                showToast("Copied");
              }}
              className="inline-flex items-center gap-1.5 h-7 px-2.5 bg-transparent border border-friday-border-soft rounded-[3px] cursor-pointer text-[11px] text-friday-fg-muted hover:text-friday-fg hover:border-friday-border"
            >
              Copy
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ─── Composer ─────────────────────────────────────────────────────
function Composer({
  value,
  setValue,
  onSend,
  loading,
}: {
  value: string;
  setValue: (v: string) => void;
  onSend: () => void;
  loading: boolean;
}) {
  const ref = React.useRef<HTMLTextAreaElement>(null);

  React.useEffect(() => {
    const t = ref.current;
    if (!t) return;
    t.style.height = "auto";
    t.style.height = `${Math.min(t.scrollHeight, 200)}px`;
  }, [value]);

  const submit = () => {
    if (!value.trim() || loading) return;
    onSend();
  };

  return (
    <div className="px-7 pb-5 pt-2.5 border-t border-friday-border-soft bg-friday-bg">
      <div className="max-w-[760px] mx-auto">
        <div
          className="flex items-end gap-2 p-2 bg-friday-surface border border-friday-border-soft rounded-md focus-within:border-friday-border"
          style={{ minHeight: 56 }}
        >
          <textarea
            ref={ref}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder="Ask Aria — Enter to send, Shift+Enter for newline"
            className="flex-1 min-h-9 max-h-[200px] px-2 py-2 bg-transparent border-0 outline-none text-[13px] text-friday-fg leading-relaxed resize-none"
            disabled={loading}
          />
          <button
            type="button"
            onClick={submit}
            disabled={!value.trim() || loading}
            aria-label="Send"
            className={cn(
              "h-9 px-3 rounded text-[12px] font-medium border-0 inline-flex items-center gap-1.5",
              value.trim() && !loading
                ? "bg-friday-accent text-white cursor-pointer hover:opacity-90"
                : "bg-friday-surface-2 text-friday-fg-subtle cursor-default",
            )}
          >
            {loading ? "…" : "Send"}
            {!loading ? <I.ArrowRight size={11} /> : null}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Header strip ─────────────────────────────────────────────────
function AriaHeader({
  title,
  ready,
}: {
  title: string;
  ready: boolean;
}) {
  return (
    <div
      className="px-7 border-b border-friday-border-soft bg-friday-bg shrink-0 flex items-center gap-3"
      style={{ height: 56 }}
    >
      <AriaMark size={26} />
      <div className="flex-1 min-w-0">
        <h2 className="font-display italic font-medium text-[16px] text-friday-fg m-0 -tracking-[0.2px] truncate">
          {title}
        </h2>
        <div className="text-[10px] text-friday-fg-muted tracking-wide">
          DBS GPT · grounded on your portfolio
        </div>
      </div>
      <span
        className="inline-flex items-center gap-1.5 px-2.5 h-6 rounded-full bg-friday-surface-2 border border-friday-border-soft text-[10.5px] text-friday-fg-muted tracking-wide"
      >
        <span
          className="w-[5px] h-[5px] rounded-full"
          style={{ background: ready ? "#22c55e" : "#a8a59d" }}
        />
        {ready ? "Online" : "Initialising"}
      </span>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────
export default function AriaPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [sessions, setSessions] = React.useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = React.useState<string | null>(
    null,
  );
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [input, setInput] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [aiReady, setAiReady] = React.useState(false);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const initialQuery = React.useRef(searchParams.get("q") ?? "");
  const [initialQueryHandled, setInitialQueryHandled] = React.useState(false);

  // Auto-scroll on new content
  React.useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages]);

  // Sessions + readiness
  React.useEffect(() => {
    fetch("/api/ai-chats")
      .then((r) => r.json())
      .then((d: ChatSession[]) => setSessions(d))
      .catch(() => undefined);

    fetch("/api/ai-status")
      .then((r) => r.json())
      .then((d: { ok?: boolean }) => setAiReady(!!d.ok))
      .catch(() => setAiReady(false));
  }, []);

  // Load active session messages
  React.useEffect(() => {
    if (!activeSessionId) return;
    fetch(`/api/ai-chats/${activeSessionId}`)
      .then((r) => r.json())
      .then(
        (d: {
          messages?: Array<{
            id: string;
            role: "user" | "assistant";
            content: string;
            steps?: ToolStep[];
            artifacts?: AiArtifact[];
            blocks?: Block[];
          }>;
        }) => {
          if (!d.messages) return;
          setMessages(
            d.messages.map((m) => ({
              id: m.id,
              role: m.role,
              content: m.content,
              steps: m.steps ?? [],
              artifacts: m.artifacts ?? [],
              blocks: m.blocks ?? [],
            })),
          );
        },
      )
      .catch(() => undefined);
  }, [activeSessionId]);

  const createSession = React.useCallback(async (): Promise<string> => {
    const res = await fetch("/api/ai-chats", { method: "POST" });
    const data = (await res.json()) as ChatSession;
    setSessions((prev) => [data, ...prev]);
    setActiveSessionId(data.id);
    return data.id;
  }, []);

  const deleteSession = async (id: string) => {
    await fetch(`/api/ai-chats/${id}`, { method: "DELETE" });
    setSessions((prev) => prev.filter((s) => s.id !== id));
    if (activeSessionId === id) {
      setActiveSessionId(null);
      setMessages([]);
    }
  };

  const renameSession = async (id: string, title: string) => {
    setSessions((prev) =>
      prev.map((s) => (s.id === id ? { ...s, title } : s)),
    );
    await fetch(`/api/ai-chats/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
  };

  const sendMessage = React.useCallback(
    async (content: string) => {
      if (!content.trim() || loading) return;
      let sessionId = activeSessionId;
      if (!sessionId) sessionId = await createSession();

      const assistantId = makeId("assistant");
      setMessages((prev) => [
        ...prev,
        { id: makeId("user"), role: "user", content },
        {
          id: assistantId,
          role: "assistant",
          content: "",
          steps: [],
          isStreaming: true,
        },
      ]);
      setInput("");
      setLoading(true);

      try {
        const res = await fetch("/api/agent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId, message: content }),
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
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId
                      ? { ...m, content: m.content + event.content }
                      : m,
                  ),
                );
              } else if (event.type === "tool_call" && event.name) {
                const step: ToolStep = {
                  name: event.name,
                  label: TOOL_LABELS[event.name] ?? event.name,
                  args: event.args ?? {},
                  status: "running",
                  toolCallId: event.toolCallId,
                };
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId
                      ? { ...m, steps: [...(m.steps ?? []), step] }
                      : m,
                  ),
                );
              } else if (event.type === "tool_result") {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId
                      ? {
                          ...m,
                          steps: (m.steps ?? []).map((s) =>
                            s.toolCallId === event.toolCallId
                              ? { ...s, status: "done" as const, result: event.result }
                              : s,
                          ),
                        }
                      : m,
                  ),
                );
              } else if (event.type === "blocks" && event.blocks) {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId ? { ...m, blocks: event.blocks } : m,
                  ),
                );
              } else if (event.type === "artifact" && event.artifact) {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId
                      ? {
                          ...m,
                          artifacts: [...(m.artifacts ?? []), event.artifact!],
                        }
                      : m,
                  ),
                );
              } else if (event.type === "error") {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId
                      ? {
                          ...m,
                          isStreaming: false,
                          error: event.message ?? "Aria couldn't reach the model",
                        }
                      : m,
                  ),
                );
              }
            } catch {
              // ignore malformed event
            }
          }
        }

        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, isStreaming: false } : m,
          ),
        );

        // Refresh session list (title may have been auto-generated)
        fetch("/api/ai-chats")
          .then((r) => r.json())
          .then((d: ChatSession[]) => setSessions(d))
          .catch(() => undefined);
      } catch (err) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  isStreaming: false,
                  error:
                    err instanceof Error
                      ? err.message
                      : "Couldn't reach the agent",
                }
              : m,
          ),
        );
      } finally {
        setLoading(false);
      }
    },
    [activeSessionId, createSession, loading],
  );

  // Honour ?q= deep-link from the dashboard Aria seam
  React.useEffect(() => {
    if (initialQueryHandled) return;
    const q = initialQuery.current;
    if (!q) {
      setInitialQueryHandled(true);
      return;
    }
    setInitialQueryHandled(true);
    sendMessage(q);
    // Strip the ?q= so a refresh doesn't re-fire
    router.replace("/dashboard/ai/gpt");
  }, [initialQueryHandled, sendMessage, router]);

  const onNewChat = async () => {
    setMessages([]);
    setActiveSessionId(null);
  };

  const onSaveMessage = async (msg: ChatMessage) => {
    if (!activeSessionId) return;
    try {
      await fetch("/api/ai-saved", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: activeSessionId,
          messageId: msg.id,
          title: msg.content.slice(0, 80) || "Saved insight",
          text: msg.content,
          blocks: msg.blocks ?? [],
        }),
      });
      showToast("Saved to insights");
    } catch {
      showToast("Couldn't save", "danger");
    }
  };

  const activeSession = sessions.find((s) => s.id === activeSessionId);
  const headerTitle = activeSession?.title ?? "New chat";

  return (
    <div className="flex-1 flex min-w-0 min-h-0 overflow-hidden bg-friday-bg">
      <ChatSidebar
        sessions={sessions}
        activeId={activeSessionId}
        onSelect={(id) => setActiveSessionId(id)}
        onNew={onNewChat}
        onRename={renameSession}
        onDelete={deleteSession}
      />

      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        <AriaHeader title={headerTitle} ready={aiReady} />

        <div ref={scrollRef} className="flex-1 overflow-y-auto">
          {messages.length === 0 ? (
            <Welcome onPick={(q) => sendMessage(q)} />
          ) : (
            <div className="max-w-[760px] mx-auto px-7 py-6 flex flex-col gap-5">
              {messages.map((m) =>
                m.role === "user" ? (
                  <UserMessage key={m.id} content={m.content} />
                ) : (
                  <AssistantMessage
                    key={m.id}
                    msg={m}
                    onSave={onSaveMessage}
                  />
                ),
              )}
            </div>
          )}
        </div>

        <Composer
          value={input}
          setValue={setInput}
          onSend={() => sendMessage(input)}
          loading={loading}
        />
      </div>
    </div>
  );
}
