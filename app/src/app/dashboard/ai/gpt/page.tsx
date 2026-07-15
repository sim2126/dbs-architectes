"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowRight,
  Bookmark,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Download,
  ExternalLink,
  Loader2,
  MessageSquarePlus,
  MoreHorizontal,
  Pencil,
  RotateCcw,
  Send,
  Sparkles,
  Table2,
  Trash2,
  User,
  CheckCircle2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { Avatar, AvatarFallback } from "@/ui/components/avatar";
import { Button } from "@/ui/components/button";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/ui/utils";
import { AiLogo } from "@/features/ai/client/ai-logo";
import {
  AiArtifact,
  generateSessionTitle,
  PersistedToolStep,
} from "@/features/ai/server/agent/artifacts";
import type { Block } from "@/features/ai/server/agent/blocks";
import { BlocksView } from "@/features/ai/client/agent-blocks";

// ─── Types ────────────────────────────────────────────────────

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
  tools?: string[];
  name?: string;
  args?: Record<string, unknown>;
  message?: string;
  artifact?: AiArtifact;
  blocks?: Block[];
  // v3 — surfaced so the client can persist tool calls + their results
  // for cross-turn context reconstruction.
  toolCallId?: string;
  result?: string;
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

const PENDO_AGENT_ID = "8Iq3SrfyAGij3yEnYXDiLaC29cA";

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
// Minimal: a single "THOUGHT FOR Xs" header with a numbered step
// transcript underneath. Auto-collapses once the agent is done so the
// reading focus is the response, not the trace.

function ThinkingPanel({
  steps,
  isStreaming,
  durationMs,
}: {
  steps: ToolStep[];
  isStreaming?: boolean;
  durationMs?: number;
}) {
  const [open, setOpen] = useState(true);
  const [autoCollapsed, setAutoCollapsed] = useState(false);
  const doneCount = steps.filter((s) => s.status === "done").length;
  const allDone = doneCount === steps.length && !isStreaming;

  useEffect(() => {
    if (allDone && !autoCollapsed) {
      setOpen(false);
      setAutoCollapsed(true);
    }
  }, [allDone, autoCollapsed]);

  if (steps.length === 0 && !isStreaming) return null;

  const seconds = durationMs ? (durationMs / 1000).toFixed(1) : null;

  let headerLabel: string;
  if (isStreaming && steps.length === 0) {
    headerLabel = "Thinking…";
  } else if (allDone) {
    headerLabel = seconds ? `Thought for ${seconds}s` : `Thought for ${steps.length} step${steps.length === 1 ? "" : "s"}`;
  } else {
    headerLabel = `Thinking · ${doneCount} / ${steps.length}`;
  }

  return (
    <div className="rounded-lg border border-friday-border-soft bg-friday-surface overflow-hidden mb-2">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-friday-surface-2 transition-colors text-left"
      >
        <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-friday-fg-subtle">
          {headerLabel}
        </span>
        <span className="flex-1" />
        {steps.length > 0 &&
          (open ? (
            <ChevronDown className="h-3 w-3 text-friday-fg-subtle shrink-0" />
          ) : (
            <ChevronRight className="h-3 w-3 text-friday-fg-subtle shrink-0" />
          ))}
      </button>

      <AnimatePresence>
        {open && steps.length > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden border-t border-friday-border-soft"
          >
            <ol className="px-3 py-2">
              {steps.map((step, idx) => {
                const argsStr = formatArgs(step.args);
                const num = String(idx + 1).padStart(2, "0");
                return (
                  <li
                    key={idx}
                    className="flex items-baseline gap-3 py-1 text-[12.5px] text-friday-fg"
                  >
                    <span className="font-mono text-[10px] text-friday-fg-subtle tabular-nums shrink-0">
                      {num}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span>{step.label}</span>
                      {argsStr && (
                        <span className="block font-mono text-[10.5px] text-friday-fg-subtle truncate mt-0.5">
                          {argsStr}
                        </span>
                      )}
                    </span>
                  </li>
                );
              })}
            </ol>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Message bubble ───────────────────────────────────────────

function ArtifactTableCard({
  artifact,
  onExport,
  onOpenSheet,
}: {
  artifact: AiArtifact;
  onExport: (artifactId: string) => void;
  onOpenSheet?: (sheetId: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const previewRows = open ? artifact.rows : artifact.rows.slice(0, 6);
  const isExporting = "isExporting" in artifact && Boolean(artifact.isExporting);
  const sheetId = "sheetId" in artifact && typeof artifact.sheetId === "string" ? artifact.sheetId : null;

  return (
    <div className="overflow-hidden rounded-[26px] border border-border bg-card shadow-sm">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-muted text-muted-foreground">
            <Table2 className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{artifact.title}</p>
            <p className="text-[11px] text-muted-foreground">
              {artifact.rowCount} row{artifact.rowCount === 1 ? "" : "s"}
              {artifact.description ? ` · ${artifact.description}` : ""}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setOpen((value) => !value)}
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            {open ? "Collapse" : "Preview"}
          </button>

          {sheetId && onOpenSheet ? (
            <button
              onClick={() => onOpenSheet(sheetId)}
              className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-emerald-700"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Open In Sheets
            </button>
          ) : (
            <button
              onClick={() => onExport(artifact.id)}
              disabled={isExporting}
              className="inline-flex items-center gap-1 rounded-lg bg-foreground px-2.5 py-1.5 text-xs font-medium text-background transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isExporting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Download className="h-3.5 w-3.5" />
              )}
              Export To Sheets
            </button>
          )}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-xs">
          <thead className="bg-muted/70">
            <tr>
              {artifact.columns.map((column) => (
                <th
                  key={column}
                  className="whitespace-nowrap border-b border-border px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
                >
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {previewRows.length > 0 ? (
              previewRows.map((row, rowIndex) => (
                <tr key={`${artifact.id}-${rowIndex}`} className="border-b border-border/50 hover:bg-accent/20">
                  {artifact.columns.map((column) => (
                    <td key={`${artifact.id}-${rowIndex}-${column}`} className="max-w-[220px] px-3 py-2 align-top text-foreground">
                      <span className="block whitespace-pre-wrap break-words leading-5">
                        {row[column] || "—"}
                      </span>
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={artifact.columns.length} className="px-3 py-8 text-center text-xs text-muted-foreground">
                  No rows returned for this view.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {!open && artifact.rows.length > 6 && (
        <div className="border-t border-border px-4 py-2 text-[11px] text-muted-foreground">
          Showing 6 of {artifact.rowCount} row{artifact.rowCount === 1 ? "" : "s"}.
        </div>
      )}
    </div>
  );
}

function MessageBubble({
  message,
  sessionId,
  onRetry,
  onExportArtifact,
  onOpenSheet,
}: {
  message: ChatMessage;
  sessionId: string | null;
  onRetry?: () => void;
  onExportArtifact?: (artifactId: string) => void;
  onOpenSheet?: (sheetId: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  const copy = useCallback(() => {
    navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [message.content]);

  const save = useCallback(async () => {
    if (saving || saved) return;
    setSaving(true);
    try {
      const res = await fetch("/api/ai-saved", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          messageId: message.id,
          text: message.content,
          blocks: message.blocks ?? [],
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      console.error("[gpt] save insight failed:", err);
    } finally {
      setSaving(false);
    }
  }, [message.id, message.content, message.blocks, sessionId, saved, saving]);

  if (message.role === "user") {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex justify-end"
      >
        <div className="max-w-[75%] rounded-full px-4 py-2 bg-friday-fg text-friday-bg">
          <p className="text-[13.5px] leading-snug">{message.content}</p>
        </div>
      </motion.div>
    );
  }

  // Assistant message — quiet card with avatar + thought + response
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex gap-3 justify-start"
    >
      <div className="shrink-0">
        <AiLogo variant="mark" size={32} />
      </div>

      <div className="flex-1 min-w-0 max-w-[92%] space-y-1.5">
        {/* Thinking / tool steps */}
        {((message.steps && message.steps.length > 0) || message.isStreaming) && (
          <ThinkingPanel steps={message.steps ?? []} isStreaming={message.isStreaming} />
        )}

        {message.artifacts && message.artifacts.length > 0 && (
          <div className="space-y-3">
            {message.artifacts.map((artifact) => (
              <ArtifactTableCard
                key={artifact.id}
                artifact={artifact}
                onExport={(artifactId) => onExportArtifact?.(artifactId)}
                onOpenSheet={onOpenSheet}
              />
            ))}
          </div>
        )}

        {/* Response — Gen-UI blocks preferred; Markdown fallback for errors / old history. */}
        {message.blocks && message.blocks.length > 0 ? (
          <div className="rounded-lg border border-friday-border-soft bg-friday-surface px-5 py-4">
            <BlocksView blocks={message.blocks} />
          </div>
        ) : message.content ? (
          <div className="rounded-lg border border-friday-border-soft bg-friday-surface px-5 py-4">
            <div className="prose prose-sm dark:prose-invert max-w-none text-[13.5px] leading-7 [&_table]:w-full [&_table]:border-collapse [&_td]:border-b [&_td]:border-friday-border-soft [&_td]:px-3 [&_td]:py-2 [&_th]:border-b [&_th]:border-friday-border [&_th]:bg-transparent [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:text-[10px] [&_th]:font-mono [&_th]:uppercase [&_th]:tracking-[0.18em] [&_th]:text-friday-fg-subtle">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
            </div>
          </div>
        ) : null}

        {/* Actions */}
        {!message.isStreaming && (message.content || (message.blocks && message.blocks.length > 0)) && (
          <div className="flex items-center gap-3 pt-1">
            <button
              onClick={copy}
              className="inline-flex items-center gap-1 text-[11px] text-friday-fg-subtle hover:text-friday-fg transition-colors"
            >
              {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              {copied ? "Copied" : "Copy"}
            </button>
            <button
              onClick={save}
              disabled={saving}
              className={cn(
                "inline-flex items-center gap-1 text-[11px] transition-colors",
                saved
                  ? "text-friday-accent"
                  : "text-friday-fg-subtle hover:text-friday-fg",
                saving && "opacity-50",
              )}
            >
              <Bookmark className={cn("h-3 w-3", saved && "fill-current")} />
              {saved ? "Saved" : "Save"}
            </button>
            {onRetry && (
              <button
                onClick={onRetry}
                className="inline-flex items-center gap-1 text-[11px] text-friday-fg-subtle hover:text-friday-fg transition-colors"
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
          className="flex items-center justify-center gap-1.5 w-full rounded-md border border-friday-border-soft bg-friday-surface px-3 py-2 text-[12.5px] text-friday-fg hover:border-friday-fg/40 transition-colors"
        >
          <MessageSquarePlus className="h-3.5 w-3.5" />
          New chat
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-1.5 pb-3 space-y-3">
        {Object.entries(grouped).map(([label, items]) => {
          if (items.length === 0) return null;
          return (
            <div key={label}>
              <p className="px-3 pt-2 pb-1 font-mono text-[9.5px] uppercase tracking-[0.22em] text-friday-fg-subtle">
                {label}
              </p>
              <div>
                {items.map((s) => (
                  <div
                    key={s.id}
                    className={cn(
                      "group relative flex items-center gap-2 px-3 py-1.5 cursor-pointer transition-colors text-[12.5px]",
                      activeId === s.id
                        ? "text-friday-fg font-medium"
                        : "text-friday-fg-muted hover:text-friday-fg",
                    )}
                    onClick={() => onSelect(s.id)}
                  >
                    {activeId === s.id && (
                      <span className="absolute left-0 top-2 bottom-2 w-0.5 rounded-sm bg-friday-accent" />
                    )}
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
                        className="flex-1 bg-transparent text-[12.5px] outline-none border-b border-friday-fg"
                      />
                    ) : (
                      <span className="flex-1 truncate">{s.title}</span>
                    )}

                    <div className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity relative">
                      <button
                        onClick={(e) => { e.stopPropagation(); setMenuId(menuId === s.id ? null : s.id); }}
                        className="p-1 rounded-sm hover:bg-friday-surface-2 transition-colors"
                      >
                        <MoreHorizontal className="h-3 w-3 text-friday-fg-subtle" />
                      </button>
                      {menuId === s.id && (
                        <div
                          className="absolute right-0 top-6 z-50 min-w-[120px] rounded-md border border-friday-border bg-friday-surface shadow-md py-1"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            onClick={() => { setEditValue(s.title); setEditingId(s.id); setMenuId(null); }}
                            className="flex items-center gap-2 w-full px-3 py-1.5 text-[12px] hover:bg-friday-surface-2 transition-colors"
                          >
                            <Pencil className="h-3 w-3" /> Rename
                          </button>
                          <button
                            onClick={() => { onDelete(s.id); setMenuId(null); }}
                            className="flex items-center gap-2 w-full px-3 py-1.5 text-[12px] text-red-600 hover:bg-friday-surface-2 transition-colors"
                          >
                            <Trash2 className="h-3 w-3" /> Delete
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
          <p className="px-3 pt-4 text-[11px] text-friday-fg-subtle text-center italic">No conversations yet</p>
        )}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────

export default function DBSGPTPage() {
  const router = useRouter();

  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingSession, setLoadingSession] = useState(false);
  const [aiStatus, setAiStatus] = useState<{
    enabled: boolean;
    message?: string;
    eta?: string;
  }>({ enabled: true });

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const seqRef = useRef(0);
  const pendingUserContent = useRef("");
  const pendingAssistantContent = useRef("");
  const pendingAssistantArtifacts = useRef<AiArtifact[]>([]);
  const pendingAssistantSteps = useRef<ToolStep[]>([]);
  const pendingAssistantBlocks = useRef<Block[]>([]);

  const makeId = (role: string) => `${role}-${++seqRef.current}`;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Load sessions
  useEffect(() => {
    fetch("/api/ai-chats").then((r) => r.json()).then((d: ChatSession[]) => setSessions(d)).catch(() => {});
  }, []);

  // Probe AI status — when AI_DISABLED is on in Vercel, the empty state
  // explains the planned break and the composer is disabled instead of
  // letting users send messages that would 503.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/ai-status")
      .then((r) => r.json())
      .then((d: { enabled?: boolean; message?: string; eta?: string }) => {
        if (cancelled) return;
        setAiStatus({
          enabled: d.enabled ?? true,
          message: d.message,
          eta: d.eta,
        });
      })
      .catch(() => {
        /* default optimistic — assume enabled */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Tracks sessions whose messages are already represented in local state —
  // freshly created sessions, or sessions we just fetched. Prevents the
  // session-load effect from racing sendMessage() and wiping the in-flight
  // user/assistant messages right after a starter-prompt click.
  const loadedSessionRef = useRef<string | null>(null);

  // Restore the previously-viewed chat from ?chat=<id> on mount so a
  // refresh / sidebar-jump / back-button keeps the user inside their
  // last conversation instead of dumping them into a fresh empty chat.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const chatParam = params.get("chat");
    if (chatParam) setActiveSessionId(chatParam);
  // Mount-only — subsequent URL changes are driven by the effect below.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Mirror activeSessionId into the URL via replaceState so refreshes /
  // navigation away & back land on the same chat. Uses replaceState
  // rather than router.push so flipping between chats doesn't pollute
  // browser history with one entry per click.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (activeSessionId) {
      if (url.searchParams.get("chat") === activeSessionId) return;
      url.searchParams.set("chat", activeSessionId);
    } else {
      if (!url.searchParams.has("chat")) return;
      url.searchParams.delete("chat");
    }
    window.history.replaceState(null, "", url.toString());
  }, [activeSessionId]);

  // Load messages for active session (skipped when already primed locally)
  useEffect(() => {
    if (!activeSessionId) {
      setMessages([]);
      loadedSessionRef.current = null;
      return;
    }
    if (loadedSessionRef.current === activeSessionId) return;

    setLoadingSession(true);
    fetch(`/api/ai-chats/${activeSessionId}`)
      .then(async (r) => {
        if (!r.ok) {
          // Stale ?chat=<id> from a deleted/foreign session — drop it
          // so the URL cleans up and we land on the empty new-chat state.
          setActiveSessionId(null);
          loadedSessionRef.current = null;
          throw new Error(`HTTP ${r.status}`);
        }
        return r.json();
      })
      .then((d: { messages: { id: string; role: string; content: string; artifacts?: AiArtifact[]; steps?: ToolStep[]; blocks?: Block[] }[] }) => {
        setMessages((d.messages ?? []).map((m) => ({
          id: m.id,
          role: m.role as "user" | "assistant",
          content: m.content,
          artifacts: m.artifacts ?? [],
          steps: m.steps ?? [],
          blocks: m.blocks ?? [],
        })));
        loadedSessionRef.current = activeSessionId;
      })
      .catch(() => {})
      .finally(() => setLoadingSession(false));
  }, [activeSessionId]);

  const createSession = useCallback(async (): Promise<string> => {
    const res = await fetch("/api/ai-chats", { method: "POST" });
    const data = await res.json() as ChatSession;
    setSessions((prev) => [data, ...prev]);
    // Mark as locally-loaded BEFORE switching activeSessionId, so the load
    // effect's early-return kicks in on the same render tick.
    loadedSessionRef.current = data.id;
    setMessages([]);
    setActiveSessionId(data.id);
    return data.id;
  }, []);

  // "New chat" no longer hits the DB — we just reset local state. The
  // session row is created lazily by sendMessage() when the user
  // actually sends their first message, so abandoned new-chat rows
  // never accumulate.
  const handleNew = useCallback(() => {
    setActiveSessionId(null);
    setMessages([]);
    loadedSessionRef.current = null;
  }, []);

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

  const saveMessages = useCallback(async (
    sessionId: string,
    userContent: string,
    assistantContent: string,
    assistantArtifacts: AiArtifact[],
    assistantSteps: ToolStep[],
    assistantBlocks: Block[],
    isFirst: boolean
  ) => {
    const title = isFirst ? generateSessionTitle(userContent) : undefined;
    await fetch(`/api/ai-chats/${sessionId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userContent,
        assistantContent,
        assistantArtifacts,
        assistantSteps,
        assistantBlocks,
        title,
      }),
    });
    setSessions((prev) => prev.map((s) => s.id === sessionId
      ? { ...s, updatedAt: new Date().toISOString(), ...(title ? { title } : {}) }
      : s
    ));
  }, []);

  const openSheet = useCallback((sheetId: string) => {
    router.push(`/dashboard/sheets?sheet=${sheetId}`);
  }, [router]);

  const exportArtifactToSheets = useCallback(async (messageId: string, artifactId: string) => {
    const targetMessage = messages.find((message) => message.id === messageId);
    const artifact = targetMessage?.artifacts?.find((item) => item.id === artifactId);
    if (!artifact) return;

    setMessages((prev) => prev.map((message) => (
      message.id !== messageId
        ? message
        : {
            ...message,
            artifacts: (message.artifacts ?? []).map((item) =>
              item.id === artifactId ? { ...item, isExporting: true } : item
            ),
          }
    )));

    try {
      const res = await fetch("/api/sheets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: artifact.title,
          columns: artifact.columns,
          rows: artifact.rows,
        }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const created = await res.json() as { id: string };

      setMessages((prev) => prev.map((message) => (
        message.id !== messageId
          ? message
          : {
              ...message,
              artifacts: (message.artifacts ?? []).map((item) =>
                item.id === artifactId ? { ...item, isExporting: false, sheetId: created.id } : item
              ),
            }
      )));
    } catch {
      setMessages((prev) => prev.map((message) => (
        message.id !== messageId
          ? message
          : {
              ...message,
              artifacts: (message.artifacts ?? []).map((item) =>
                item.id === artifactId ? { ...item, isExporting: false } : item
              ),
            }
      )));
    }
  }, [messages]);

  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim() || loading) return;

    let sessionId = activeSessionId;
    const isFirst = messages.length === 0;
    if (!sessionId) sessionId = await createSession();

    const userMsg: ChatMessage = { id: makeId("user"), role: "user", content };
    const assistantId = makeId("assistant");
    const assistantMsg: ChatMessage = { id: assistantId, role: "assistant", content: "", steps: [], isStreaming: true };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);

    if (typeof window !== "undefined" && window.pendo?.trackAgent) {
      window.pendo.trackAgent("prompt", {
        agentId: "8Iq3SrfyAGij3yEnYXDiLaC29cA",
        conversationId: sessionId!,
        messageId: userMsg.id,
        content,
        suggestedPrompt: STARTER_PROMPTS.includes(content),
      });
    }

    setInput("");
    setLoading(true);
    pendingUserContent.current = content;
    pendingAssistantContent.current = "";
    pendingAssistantArtifacts.current = [];
    pendingAssistantSteps.current = [];
    pendingAssistantBlocks.current = [];

    if (textareaRef.current) textareaRef.current.style.height = "auto";

    if (typeof window !== "undefined" && window.pendo?.trackAgent) {
      window.pendo.trackAgent("prompt", {
        agentId: PENDO_AGENT_ID,
        conversationId: sessionId,
        messageId: userMsg.id,
        content,
        suggestedPrompt: STARTER_PROMPTS.includes(content),
      });
    }

    try {
      // New contract: send only the new user message + sessionId. Server
      // reconstructs prior history (including past tool calls + their
      // results) from the DB so multi-turn memory works without each
      // round burning tokens to re-call tools.
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
              pendingAssistantContent.current += event.content;
              setMessages((prev) => prev.map((m) =>
                m.id === assistantId
                  ? { ...m, content: m.content + event.content }
                  : m
              ));
            } else if (event.type === "tool_call" && event.name) {
              // Individual tool call starting — add as a running step
              const nextStep: ToolStep = {
                name: event.name,
                label: TOOL_LABELS[event.name] ?? event.name,
                args: event.args ?? {},
                status: "running",
                toolCallId: event.toolCallId,
              };
              pendingAssistantSteps.current = [...pendingAssistantSteps.current, nextStep];
              setMessages((prev) => prev.map((m) =>
                m.id === assistantId
                  ? {
                      ...m,
                      steps: [
                        ...(m.steps ?? []),
                        nextStep,
                      ],
                    }
                  : m
              ));
            } else if (event.type === "artifact" && event.artifact) {
              pendingAssistantArtifacts.current = [...pendingAssistantArtifacts.current, event.artifact];
              setMessages((prev) => prev.map((m) =>
                m.id === assistantId
                  ? {
                      ...m,
                      artifacts: [...(m.artifacts ?? []), event.artifact as AiArtifact],
                    }
                  : m
              ));
            } else if (event.type === "tool_result" && event.name) {
              // Match by toolCallId when available (correctly disambiguates
              // parallel calls of the same tool); fall back to name+running.
              const targetId = event.toolCallId;
              const stepResult = event.result;
              let markedRef = false;
              pendingAssistantSteps.current = pendingAssistantSteps.current.map((step) => {
                const idMatch = targetId && step.toolCallId === targetId;
                const nameMatch =
                  !targetId && !markedRef && step.name === event.name && step.status === "running";
                if (idMatch || nameMatch) {
                  markedRef = true;
                  return { ...step, status: "done", result: stepResult };
                }
                return step;
              });
              setMessages((prev) => prev.map((m) => {
                if (m.id !== assistantId) return m;
                let marked = false;
                const steps = (m.steps ?? []).map((s) => {
                  const idMatch = targetId && s.toolCallId === targetId;
                  const nameMatch =
                    !targetId && !marked && s.name === event.name && s.status === "running";
                  if (idMatch || nameMatch) {
                    marked = true;
                    return { ...s, status: "done" as const, result: stepResult };
                  }
                  return s;
                });
                return { ...m, steps };
              }));
            } else if (event.type === "blocks" && event.blocks) {
              pendingAssistantBlocks.current = event.blocks;
              setMessages((prev) => prev.map((m) =>
                m.id === assistantId ? { ...m, blocks: event.blocks } : m
              ));
            } else if (event.type === "done") {
              setMessages((prev) => prev.map((m) =>
                m.id === assistantId ? { ...m, isStreaming: false } : m
              ));
            } else if (event.type === "error") {
              // Log the raw upstream error for debugging; surface a friendly
              // message to the user so internal stack traces never leak into
              // the chat bubble.
              console.error("[DBS GPT] agent stream error:", event.message);
              const friendly = "Hmm — something broke on our end. Try that again?";
              pendingAssistantContent.current = friendly;
              pendingAssistantBlocks.current = [
                { type: "callout", tone: "warning", text: friendly },
              ];
              setMessages((prev) => prev.map((m) =>
                m.id === assistantId
                  ? {
                      ...m,
                      content: friendly,
                      blocks: [{ type: "callout", tone: "warning", text: friendly }],
                      isStreaming: false,
                    }
                  : m,
              ));
            }
          } catch {
            // malformed SSE line
          }
        }
      }

      if (typeof window !== "undefined" && window.pendo?.trackAgent) {
        window.pendo.trackAgent("agent_response", {
          agentId: PENDO_AGENT_ID,
          conversationId: sessionId ?? "",
          messageId: assistantId,
          content: pendingAssistantContent.current,
          modelUsed: "gpt-4.1-mini",
          toolsUsed: pendingAssistantSteps.current.map((s) => s.name),
        });
      }

      if (
        sessionId &&
        (pendingAssistantContent.current ||
          pendingAssistantArtifacts.current.length > 0 ||
          pendingAssistantBlocks.current.length > 0)
      ) {
        await saveMessages(
          sessionId,
          pendingUserContent.current,
          pendingAssistantContent.current,
          pendingAssistantArtifacts.current,
          pendingAssistantSteps.current,
          pendingAssistantBlocks.current,
          isFirst,
        );
      }
    } catch (err) {
      // Connection-level failure (network, abort, etc.). Same policy: log the
      // raw error, show a branded-friendly message in the UI.
      console.error("[DBS GPT] request failed:", err);
      const friendly = "It's not you — our end hit a snag. Give it another try in a moment.";
      pendingAssistantContent.current = friendly;
      pendingAssistantBlocks.current = [
        { type: "callout", tone: "warning", text: friendly },
      ];
      setMessages((prev) => prev.map((m) =>
        m.id === assistantId
          ? {
              ...m,
              content: friendly,
              blocks: [{ type: "callout", tone: "warning", text: friendly }],
              isStreaming: false,
            }
          : m,
      ));
      if (typeof window !== "undefined" && window.pendo?.trackAgent && sessionId) {
        window.pendo.trackAgent("agent_response", {
          agentId: PENDO_AGENT_ID,
          conversationId: sessionId,
          messageId: assistantId,
          content: friendly,
          toolsUsed: [],
        });
      }

      // Still persist so the session gets its title and the friendly error is
      // visible in history instead of leaving an orphan "New chat" sidebar row.
      if (sessionId) {
        try {
          await saveMessages(
            sessionId,
            pendingUserContent.current,
            friendly,
            pendingAssistantArtifacts.current,
            pendingAssistantSteps.current,
            pendingAssistantBlocks.current,
            isFirst,
          );
        } catch {
          /* save failure on an already-erroring path — swallow */
        }
      }
    } finally {
      setLoading(false);
    }
  }, [loading, messages, activeSessionId, createSession, saveMessages]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(input); }
  }

  function handleTextareaChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = Math.min(e.target.scrollHeight, 140) + "px";
  }

  const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");

  const activeSession = activeSessionId
    ? sessions.find((s) => s.id === activeSessionId)
    : null;
  const activeTimeAgo = activeSession
    ? (() => {
        const ms = Date.now() - new Date(activeSession.updatedAt).getTime();
        const minutes = Math.floor(ms / 60_000);
        if (minutes < 1) return "just now";
        if (minutes < 60) return `${minutes} min ago`;
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours} h ago`;
        const days = Math.floor(hours / 24);
        return `${days} d ago`;
      })()
    : null;

  return (
    <div className="flex h-[calc(100vh-64px)] bg-friday-bg">
      {/* History sidebar */}
      <div className="w-64 shrink-0 border-r border-friday-border-soft bg-friday-bg flex flex-col overflow-hidden">
        <div className="px-4 py-4 border-b border-friday-border-soft shrink-0">
          <AiLogo variant="wordmark" size={36} />
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
        <div className="shrink-0 border-b border-friday-border-soft bg-friday-bg/95 backdrop-blur-sm px-6 py-3 flex items-center justify-between gap-4">
          <div className="min-w-0 flex items-baseline gap-2.5">
            {activeSession ? (
              <>
                <span className="font-display italic text-[15px] text-friday-fg truncate">
                  {activeSession.title}
                </span>
                <span className="font-mono text-[10.5px] text-friday-fg-subtle uppercase tracking-[0.18em] shrink-0">
                  DBS AI · {activeTimeAgo}
                </span>
              </>
            ) : (
              <span className="font-mono text-[10.5px] text-friday-fg-subtle uppercase tracking-[0.22em]">
                New conversation
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <span className="hidden sm:flex items-center gap-1 text-[10.5px] text-friday-fg-subtle">
              <kbd className="px-1.5 py-0.5 font-mono text-[10px] border border-friday-border-soft rounded bg-friday-surface">⌘K</kbd>
            </span>
            {messages.length > 0 && (
              <button
                onClick={handleNew}
                className="inline-flex items-center gap-1 text-[12px] text-friday-fg-muted hover:text-friday-fg transition-colors"
              >
                + New chat
              </button>
            )}
          </div>
        </div>

        {/* Messages / empty state */}
        <div className="flex-1 overflow-y-auto">
          {loadingSession ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : !aiStatus.enabled ? (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="mx-auto flex h-full max-w-2xl items-center justify-center px-6 py-10"
            >
              <div className="rounded-md border border-friday-border-soft bg-friday-surface p-8 text-center max-w-md">
                <AiLogo variant="mark" size={48} className="mx-auto" />
                <p className="mt-4 font-mono text-[9.5px] uppercase tracking-[0.22em] text-friday-fg-subtle">
                  DBS AI · scheduled break
                </p>
                <h2 className="mt-2 font-display italic text-friday-fg text-2xl leading-tight">
                  Back online {aiStatus.eta ?? "soon"}
                </h2>
                <p className="mt-3 text-[13px] leading-7 text-friday-fg-muted">
                  {aiStatus.message ??
                    "DBS AI is taking a short planned break. It will be back online shortly."}
                </p>
                <p className="mt-5 font-mono text-[10px] tracking-[0.22em] uppercase text-friday-fg-subtle">
                  DBS Architectes · Friday
                </p>
              </div>
            </motion.div>
          ) : messages.length === 0 ? (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="mx-auto max-w-2xl px-6 py-12"
            >
              {/* Quiet greeting — no gradient hero card. Wordmark sets the
                  brand; italic Cormorant prompt invites the user; starter
                  cards live on the cream/dark Friday surface. */}
              <div className="text-center space-y-6">
                <AiLogo variant="hero" size={68} className="mx-auto" />
                <h2 className="font-display italic text-friday-fg text-3xl leading-[1.15] tracking-tight">
                  Ask anything about DBS projects,<br />
                  deadlines, team, or regulations.
                </h2>
              </div>

              <div className="mt-10 grid gap-2.5 sm:grid-cols-2">
                {STARTER_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    onClick={() => sendMessage(prompt)}
                    className="group rounded-md border border-friday-border-soft bg-friday-surface px-4 py-3 text-left hover:border-friday-fg/30 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-[13px] text-friday-fg leading-snug">{prompt}</p>
                      <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-friday-fg-subtle opacity-0 transition-opacity group-hover:opacity-100" />
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
                    sessionId={activeSessionId}
                    onExportArtifact={(artifactId) => exportArtifactToSheets(message.id, artifactId)}
                    onOpenSheet={openSheet}
                    onRetry={
                      message.role === "assistant" && idx === messages.length - 1 && lastUserMsg
                        ? () => {
                            if (typeof window !== "undefined" && window.pendo?.trackAgent) {
                              window.pendo.trackAgent("user_reaction", {
                                agentId: PENDO_AGENT_ID,
                                conversationId: activeSessionId ?? "",
                                messageId: message.id,
                                content: "retry",
                              });
                            }
                            setMessages((prev) => prev.slice(0, -1));
                            sendMessage(lastUserMsg.content);
                          }
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
              placeholder={
                aiStatus.enabled
                  ? "Ask about projects, deadlines, team workload, regulations…"
                  : `DBS AI is offline — back ${aiStatus.eta ?? "soon"}`
              }
              value={input}
              onChange={handleTextareaChange}
              onKeyDown={handleKeyDown}
              rows={1}
              disabled={!aiStatus.enabled}
              className="flex-1 min-h-[52px] max-h-[140px] resize-none rounded-2xl border border-border bg-background px-4 py-3.5 text-sm outline-none focus:ring-2 focus:ring-foreground/20 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
            />
            <Button
              onClick={() => sendMessage(input)}
              disabled={!input.trim() || loading || !aiStatus.enabled}
              size="icon"
              className="h-[52px] w-[52px] rounded-2xl shrink-0"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
          <p className="mx-auto max-w-3xl mt-2 text-xs text-muted-foreground">
            {aiStatus.enabled
              ? "Enter to send · Shift+Enter for new line"
              : `Scheduled return: ${aiStatus.eta ?? "soon"}`}
          </p>
        </div>
      </div>
    </div>
  );
}
