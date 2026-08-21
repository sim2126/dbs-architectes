"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowUp,
  ChevronsRight,
  History,
  Loader2,
  PanelRightClose,
  Plus,
  Search,
  Sparkles,
  Trash2,
} from "lucide-react";
import { cn } from "@/ui/utils";
import { showToast } from "@/ui/components/toast";
import {
  ASSISTANT_MAX_WIDTH,
  ASSISTANT_MIN_WIDTH,
  useAssistantStore,
} from "@/ui/stores/assistant-store";
import { INTENT_PRESETS, type IntentPreset } from "../domain/intents";

/**
 * DBS GPT, docked.
 *
 * Docked rather than a page because context is the point: asking what changed
 * on a project is more useful while looking at that project than after
 * navigating to a separate assistant screen and losing it.
 *
 * Every message routes through /api/agent — the grounded agent with ID
 * resolution and post-generation validation. The intent chips prefill the
 * composer; they are not separate endpoints with their own ungrounded
 * behaviour.
 */

type Turn = { role: "user" | "assistant"; content: string };
type Session = { id: string; title: string; updatedAt: string };

export function AssistantPanel() {
  const open = useAssistantStore((s) => s.open);
  const setOpen = useAssistantStore((s) => s.setOpen);
  const width = useAssistantStore((s) => s.width);
  const setWidth = useAssistantStore((s) => s.setWidth);
  const dragWidth = useAssistantStore((s) => s.dragWidth);
  const setDragWidth = useAssistantStore((s) => s.setDragWidth);

  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // ── Resize ──────────────────────────────────────────────────────
  // dragWidth updates every pointermove so the edge tracks the cursor; the
  // persisted width is written once, on release.
  useEffect(() => {
    if (!dragging) return;
    const move = (e: PointerEvent) => setDragWidth(window.innerWidth - e.clientX);
    const up = () => {
      setDragging(false);
      const final = useAssistantStore.getState().dragWidth;
      if (final !== null) setWidth(final);
      setDragWidth(null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    const prevSelect = document.body.style.userSelect;
    const prevCursor = document.body.style.cursor;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      document.body.style.userSelect = prevSelect;
      document.body.style.cursor = prevCursor;
    };
  }, [dragging, setWidth, setDragWidth]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [turns, sending]);

  // ── History ─────────────────────────────────────────────────────
  const loadSessions = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const res = await fetch("/api/ai-chats");
      if (!res.ok) return;
      const data = (await res.json()) as { sessions?: Session[] } | Session[];
      setSessions(Array.isArray(data) ? data : (data.sessions ?? []));
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  const openSession = useCallback(async (id: string) => {
    setHistoryOpen(false);
    const res = await fetch(`/api/ai-chats/${id}`);
    if (!res.ok) {
      showToast("Could not open that conversation.", "danger");
      return;
    }
    const data = (await res.json()) as {
      messages?: Array<{ role: string; content: string }>;
    };
    setSessionId(id);
    setTurns(
      (data.messages ?? [])
        // Only user and assistant turns are shown. System and tool messages
        // are transcript plumbing and would read as gibberish.
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => ({ role: m.role as Turn["role"], content: m.content })),
    );
  }, []);

  const newChat = useCallback(() => {
    // No request here. The session is created lazily by /api/agent on the
    // first message, so starting a chat you never use leaves no empty row in
    // the history list.
    setSessionId(null);
    setTurns([]);
    setDraft("");
    setHistoryOpen(false);
  }, []);

  const deleteSession = useCallback(
    async (id: string) => {
      const res = await fetch(`/api/ai-chats/${id}`, { method: "DELETE" });
      if (!res.ok) {
        showToast("Could not delete that conversation.", "danger");
        return;
      }
      setSessions((s) => s.filter((x) => x.id !== id));
      if (sessionId === id) newChat();
    },
    [sessionId, newChat],
  );

  const send = useCallback(
    async (text: string) => {
      const message = text.trim();
      if (!message || sending) return;

      setDraft("");
      setTurns((t) => [...t, { role: "user", content: message }]);
      setSending(true);
      try {
        const res = await fetch("/api/agent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message, sessionId: sessionId ?? undefined }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          showToast(body?.error ?? "The assistant could not answer.", "danger");
          // Drop the optimistic turn — leaving it implies the message was
          // sent and answered when it was not.
          setTurns((t) => t.slice(0, -1));
          return;
        }
        const data = (await res.json()) as {
          reply?: string;
          content?: string;
          sessionId?: string;
        };
        if (data.sessionId) setSessionId(data.sessionId);
        const reply = data.reply ?? data.content;
        if (!reply) {
          showToast("The assistant returned nothing.", "warning");
          setTurns((t) => t.slice(0, -1));
          return;
        }
        setTurns((t) => [...t, { role: "assistant", content: reply }]);
      } catch {
        showToast("The assistant is unreachable.", "danger");
        setTurns((t) => t.slice(0, -1));
      } finally {
        setSending(false);
      }
    },
    [sending, sessionId],
  );

  if (!open) return null;

  const liveWidth = dragWidth ?? width;
  const isEmpty = turns.length === 0;

  return (
    <aside
      style={{ width: liveWidth }}
      className="relative shrink-0 h-full flex flex-col border-l border-border bg-card"
      aria-label="DBS GPT"
    >
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize assistant panel"
        aria-valuenow={liveWidth}
        aria-valuemin={ASSISTANT_MIN_WIDTH}
        aria-valuemax={ASSISTANT_MAX_WIDTH}
        tabIndex={0}
        onPointerDown={(e) => {
          e.preventDefault();
          // Pointer capture, or a fast drag falls out of the 6px strip.
          e.currentTarget.setPointerCapture(e.pointerId);
          setDragWidth(width);
          setDragging(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") {
            e.preventDefault();
            setWidth(width + 16);
          } else if (e.key === "ArrowRight") {
            e.preventDefault();
            setWidth(width - 16);
          }
        }}
        title="Drag to resize"
        className={cn(
          "absolute inset-y-0 left-0 z-30 w-1.5 cursor-col-resize",
          "after:absolute after:inset-y-0 after:left-0 after:w-px after:transition-colors",
          "hover:after:bg-friday-accent-ring focus-visible:after:bg-friday-accent-ring",
          "focus-visible:outline-none",
          dragging && "after:bg-friday-accent-ring",
        )}
      />

      <header className="h-14 shrink-0 flex items-center justify-between gap-1 px-3 border-b border-border">
        <span className="flex items-center gap-2 min-w-0 pl-1">
          <Sparkles className="h-4 w-4 text-friday-accent shrink-0" />
          <span className="text-sm font-semibold truncate">DBS GPT</span>
        </span>

        <span className="flex items-center gap-0.5 shrink-0">
          <IconButton
            label="New chat"
            onClick={newChat}
            active={sessionId === null && isEmpty}
          >
            <Plus className="h-4 w-4" />
          </IconButton>
          <IconButton
            label="Chat history"
            active={historyOpen}
            onClick={() => {
              const next = !historyOpen;
              setHistoryOpen(next);
              if (next) void loadSessions();
            }}
          >
            <History className="h-4 w-4" />
          </IconButton>
          <IconButton label="Close assistant" onClick={() => setOpen(false)}>
            <PanelRightClose className="h-4 w-4" />
          </IconButton>
        </span>
      </header>

      {historyOpen ? (
        <div className="flex-1 min-h-0 overflow-y-auto p-3">
          <p className="text-[10px] uppercase tracking-wider text-friday-fg-subtle px-1 mb-2">
            Recent conversations
          </p>
          {loadingHistory ? (
            <p className="flex items-center gap-2 text-xs text-muted-foreground px-1 py-3">
              <Loader2 className="h-3 w-3 animate-spin" />
              Loading
            </p>
          ) : sessions.length === 0 ? (
            <p className="text-sm text-muted-foreground px-1 py-3 leading-relaxed">
              No conversations yet. Ask something and it will be saved here.
            </p>
          ) : (
            <ul className="space-y-0.5">
              {sessions.map((s) => (
                <li key={s.id} className="group/row flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => void openSession(s.id)}
                    className={cn(
                      "flex-1 min-w-0 text-left rounded-md px-2 py-2 transition-colors",
                      "hover:bg-friday-surface-2 focus-visible:outline-none",
                      "focus-visible:ring-2 focus-visible:ring-ring",
                      s.id === sessionId && "bg-friday-surface-2",
                    )}
                  >
                    <span className="block text-sm text-foreground truncate">
                      {s.title}
                    </span>
                    <span className="block text-[11px] text-friday-fg-subtle">
                      {relativeDay(s.updatedAt)}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void deleteSession(s.id)}
                    aria-label={`Delete "${s.title}"`}
                    className="shrink-0 p-1.5 rounded-md text-friday-fg-subtle opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 hover:text-friday-error-fg transition-all"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <>
          <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-4 py-4">
            {isEmpty ? (
              <div className="h-full flex flex-col items-center justify-center text-center px-2">
                <Sparkles className="h-7 w-7 text-friday-accent" strokeWidth={1.5} />
                <h2 className="font-display italic text-foreground text-2xl mt-3">
                  Your assistant
                </h2>
                <p className="text-sm text-muted-foreground mt-2 leading-relaxed max-w-[26ch]">
                  Ask about projects, people or deadlines. Answers are grounded
                  in this workspace.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {turns.map((turn, i) => (
                  <div key={i} className={cn(turn.role === "user" && "text-right")}>
                    <p className="text-[10px] uppercase tracking-wider text-friday-fg-subtle mb-1">
                      {turn.role === "user" ? "You" : "DBS GPT"}
                    </p>
                    <div
                      className={cn(
                        "inline-block text-left text-sm leading-relaxed rounded-lg px-3 py-2 max-w-[90%] whitespace-pre-wrap wrap-break-word",
                        turn.role === "user"
                          ? "bg-friday-surface-2 text-foreground"
                          : "border border-friday-border-soft text-foreground",
                      )}
                    >
                      {turn.content}
                    </div>
                  </div>
                ))}
                {sending && (
                  <p className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Thinking
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Chips only on an empty conversation. Mid-thread they are noise —
              you already know what you are asking about. */}
          {isEmpty && (
            <div className="shrink-0 px-4 pb-2 flex flex-wrap gap-1.5">
              {INTENT_PRESETS.map((preset) => (
                <IntentChip
                  key={preset.id}
                  preset={preset}
                  disabled={sending}
                  onPick={() => setDraft(preset.prompt)}
                />
              ))}
            </div>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send(draft);
            }}
            className="shrink-0 p-3 border-t border-border"
          >
            <div className="rounded-lg border border-friday-border bg-background focus-within:border-friday-accent transition-colors">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send(draft);
                  }
                }}
                rows={2}
                placeholder="Ask, create, search…"
                className="w-full resize-none bg-transparent px-3 py-2.5 text-sm leading-relaxed focus-visible:outline-none placeholder:text-friday-fg-subtle"
              />
              <div className="flex items-center justify-between px-2.5 pb-2">
                <span className="text-[10px] text-friday-fg-subtle">
                  AI Assistant · grounded in this workspace
                </span>
                <button
                  type="submit"
                  disabled={sending || draft.trim() === ""}
                  aria-label="Send"
                  className="grid h-7 w-7 place-items-center rounded-md bg-friday-accent text-friday-accent-fg disabled:opacity-40 transition-opacity"
                >
                  {sending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <ArrowUp className="h-3.5 w-3.5" />
                  )}
                </button>
              </div>
            </div>
          </form>
        </>
      )}
    </aside>
  );
}

function IconButton({
  label,
  onClick,
  active,
  children,
}: {
  label: string;
  onClick: () => void;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        "p-1.5 rounded-md transition-colors focus-visible:outline-none",
        "focus-visible:ring-2 focus-visible:ring-ring",
        active
          ? "bg-friday-surface-2 text-foreground"
          : "text-muted-foreground hover:text-foreground hover:bg-accent",
      )}
    >
      {children}
    </button>
  );
}

function IntentChip({
  preset,
  disabled,
  onPick,
}: {
  preset: IntentPreset;
  disabled: boolean;
  onPick: () => void;
}) {
  const Icon = preset.icon === "search" ? Search : ChevronsRight;
  return (
    <button
      type="button"
      onClick={onPick}
      disabled={disabled}
      title={preset.prompt}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-border",
        "px-2.5 py-1 text-xs text-muted-foreground",
        "hover:text-foreground hover:border-friday-accent transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        "disabled:opacity-50",
      )}
    >
      <Icon className="h-3 w-3" aria-hidden />
      {preset.label}
    </button>
  );
}

/** "Today" / "Yesterday" / a date. Absolute dates for anything older —
 *  "14 days ago" makes the reader do arithmetic. */
function relativeDay(iso: string): string {
  const then = new Date(iso);
  const now = new Date();
  const days = Math.floor(
    (Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) -
      Date.UTC(then.getUTCFullYear(), then.getUTCMonth(), then.getUTCDate())) /
      86_400_000,
  );
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  return then.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}
