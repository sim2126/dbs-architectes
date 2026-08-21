"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowUp,
  Bookmark,
  BookmarkCheck,
  ChevronsRight,
  FileText,
  History,
  Loader2,
  Maximize2,
  PanelRightClose,
  Paperclip,
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
import { ACCEPT_ATTRIBUTE } from "../domain/attachments";
import {
  ListOrEmpty,
  ListRow,
  relativeDay,
  type AiSession,
} from "./ai-lists";

/**
 * DBS AI, docked.
 *
 * Docked rather than a page because context is the point: asking what changed
 * on a project is more useful while looking at that project than after
 * navigating away and losing it.
 *
 * Every message routes through /api/agent — the grounded agent with ID
 * resolution and post-generation validation. The intent chips prefill the
 * composer; they are not separate endpoints with their own behaviour.
 */

type Turn = { role: "user" | "assistant"; content: string };

/**
 * The panel shows chat and its history, and nothing else.
 *
 * Saved insights and attached files live on the full DBS AI page. Browsing
 * an archive in a 440px column is worse than browsing it on a page, and
 * putting four lists behind four icons in a narrow panel turns a quick
 * question into a navigation exercise.
 */
type View = "chat" | "history";

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
  const [sessionId, setSessionId] = useState<string | null>(null);

  const [view, setView] = useState<View>("chat");
  const [sessions, setSessions] = useState<AiSession[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [savingIndex, setSavingIndex] = useState<number | null>(null);
  const [savedTurns, setSavedTurns] = useState<Set<number>>(new Set());

  const pathname = usePathname();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);

  // ── Resize ──────────────────────────────────────────────────────
  // dragWidth updates every pointermove so the edge tracks the cursor;
  // localStorage is written once, on release.
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

  // ── Secondary views ─────────────────────────────────────────────
  // One loader for all three lists. They share a shape, and three copies of
  // it would drift.
  const openView = useCallback(async (next: View) => {
    setView(next);
    if (next === "chat") return;

    const endpoint = "/api/ai-chats";

    setLoadingList(true);
    try {
      const res = await fetch(endpoint);
      if (!res.ok) {
        showToast("Could not load that list.", "danger");
        return;
      }
      const payload: unknown = await res.json();
      const pick = <T,>(key: string): T[] => {
        if (Array.isArray(payload)) return payload as T[];
        const value = (payload as Record<string, unknown>)[key];
        return Array.isArray(value) ? (value as T[]) : [];
      };
      setSessions(pick<AiSession>("sessions"));
    } finally {
      setLoadingList(false);
    }
  }, []);

  const newChat = useCallback(() => {
    // No request. The session is created lazily by /api/agent on the first
    // message, so starting a chat you never use leaves no empty row behind.
    setSessionId(null);
    setTurns([]);
    setDraft("");
    setSavedTurns(new Set());
    setView("chat");
  }, []);

  const openSession = useCallback(async (id: string) => {
    setView("chat");
    const res = await fetch(`/api/ai-chats/${id}`);
    if (!res.ok) {
      showToast("Could not open that conversation.", "danger");
      return;
    }
    const data = (await res.json()) as {
      messages?: Array<{ role: string; content: string }>;
    };
    setSessionId(id);
    setSavedTurns(new Set());
    setTurns(
      (data.messages ?? [])
        // System and tool turns are transcript plumbing and read as gibberish.
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => ({ role: m.role as Turn["role"], content: m.content })),
    );
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

  /** Keep one assistant answer for later. */
  const saveInsight = useCallback(
    async (index: number, turn: Turn) => {
      setSavingIndex(index);
      try {
        const firstLine =
          turn.content.split("\n").find((l) => l.trim().length > 0) ?? "";
        const res = await fetch("/api/ai-saved", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            // First line as the title: scannable without asking a model to
            // name it, and cheaper than a second round trip.
            title: firstLine.slice(0, 80) || "Saved insight",
            text: turn.content,
            blocks: [],
            sessionId: sessionId ?? undefined,
          }),
        });
        if (!res.ok) {
          showToast("Could not save that answer.", "danger");
          return;
        }
        setSavedTurns((prev) => new Set(prev).add(index));
        showToast("Saved", "success");
      } finally {
        setSavingIndex(null);
      }
    },
    [sessionId],
  );

  /**
   * Attach files.
   *
   * Presign, upload straight to storage, then record the row. The bytes never
   * pass through our API — routing megabytes through a serverless function to
   * write a database row caps file size for no benefit.
   */
  const attachFiles = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;

      for (const file of Array.from(files)) {
        try {
          const presign = await fetch("/api/uploads/presign", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              filename: file.name,
              contentType: file.type,
              contentLength: file.size,
            }),
          });
          if (!presign.ok) {
            const body = (await presign.json().catch(() => null)) as
              | { error?: string }
              | null;
            showToast(body?.error ?? `Could not upload ${file.name}.`, "danger");
            continue;
          }
          const { uploadUrl, url } = (await presign.json()) as {
            uploadUrl?: string;
            url?: string;
          };

          if (uploadUrl) {
            const put = await fetch(uploadUrl, {
              method: "PUT",
              headers: { "Content-Type": file.type },
              body: file,
            });
            if (!put.ok) {
              showToast(`Upload failed for ${file.name}.`, "danger");
              continue;
            }
          }

          const record = await fetch("/api/ai-attachments", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              filename: file.name,
              contentType: file.type,
              sizeBytes: file.size,
              url: url ?? uploadUrl ?? "",
              sessionId: sessionId ?? undefined,
            }),
          });
          if (!record.ok) {
            const body = (await record.json().catch(() => null)) as
              | { error?: string }
              | null;
            showToast(body?.error ?? `Could not attach ${file.name}.`, "danger");
            continue;
          }
          showToast(`${file.name} attached`, "success");

          // Kick extraction, but do not wait on it. A vision call per image
          // would make attaching three files feel broken; the route is a pull,
          // so an unread file is simply picked up on the next call.
          void fetch("/api/ai-attachments/ingest", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({}),
          });
        } catch {
          showToast(`Could not attach ${file.name}.`, "danger");
        }
      }
    },
    [sessionId],
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

  /*
   * The panel never appears on the full DBS AI page.
   *
   * Two of the same assistant side by side would be two independent
   * conversations that both write to the same history — the user would end up
   * with a split thread and no way to tell which half went where. The page is
   * the superset, so it wins.
   */
  const onFullPage = pathname?.startsWith("/dashboard/ai/gpt") ?? false;
  if (onFullPage || !open) return null;

  const liveWidth = dragWidth ?? width;
  const isEmpty = turns.length === 0;

  return (
    <aside
      style={{ width: liveWidth }}
      className="relative shrink-0 h-full flex flex-col border-l border-border bg-card"
      aria-label="DBS AI"
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
          // Pointer capture, or a fast drag falls out of the strip.
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
          <span className="text-sm font-semibold truncate">DBS AI</span>
        </span>

        <span className="flex items-center gap-0.5 shrink-0">
          <IconButton label="New chat" onClick={newChat}>
            <Plus className="h-4 w-4" />
          </IconButton>
          <IconButton
            label="Chat history"
            active={view === "history"}
            onClick={() => void openView(view === "history" ? "chat" : "history")}
          >
            <History className="h-4 w-4" />
          </IconButton>
          <Link
            /*
             * Carries the current conversation across. The page already reads
             * ?chat= on load and mirrors it back, so expanding continues the
             * same thread rather than starting a second one — the session
             * lives in the database, and both surfaces post to /api/agent.
             */
            href={
              sessionId
                ? `/dashboard/ai/gpt?chat=${encodeURIComponent(sessionId)}`
                : "/dashboard/ai/gpt"
            }
            aria-label="Open full DBS AI"
            title="Open the full page — continues this conversation"
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            <Maximize2 className="h-4 w-4" />
          </Link>
          <IconButton label="Close assistant" onClick={() => setOpen(false)}>
            <PanelRightClose className="h-4 w-4" />
          </IconButton>
        </span>
      </header>

      {view !== "chat" ? (
        <div className="flex-1 min-h-0 overflow-y-auto p-3">
          <p className="text-[10px] uppercase tracking-wider text-friday-fg-subtle px-1 mb-2">
            {view === "history"
              ? "Recent conversations"
              : view === "saved"
                ? "Saved insights"
                : "Attached files"}
          </p>

          {loadingList ? (
            <p className="flex items-center gap-2 text-xs text-muted-foreground px-1 py-3">
              <Loader2 className="h-3 w-3 animate-spin" />
              Loading
            </p>
          ) : (
            <ListOrEmpty
              empty={sessions.length === 0}
              note="No conversations yet. Ask something and it will be kept here."
            >
              {sessions.map((session) => (
                <ListRow
                  key={session.id}
                  title={session.title}
                  meta={relativeDay(session.updatedAt)}
                  active={session.id === sessionId}
                  onOpen={() => void openSession(session.id)}
                  onDelete={() => void deleteSession(session.id)}
                  deleteLabel={`Delete ${session.title}`}
                />
              ))}
            </ListOrEmpty>
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
                      {turn.role === "user" ? "You" : "DBS AI"}
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
                    {turn.role === "assistant" && (
                      <button
                        type="button"
                        onClick={() => void saveInsight(i, turn)}
                        disabled={savingIndex === i || savedTurns.has(i)}
                        aria-label={savedTurns.has(i) ? "Saved" : "Save this answer"}
                        className={cn(
                          "mt-1 inline-flex items-center gap-1 text-[11px] transition-colors",
                          savedTurns.has(i)
                            ? "text-friday-accent"
                            : "text-friday-fg-subtle hover:text-foreground",
                        )}
                      >
                        {savingIndex === i ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : savedTurns.has(i) ? (
                          <BookmarkCheck className="h-3 w-3" />
                        ) : (
                          <Bookmark className="h-3 w-3" />
                        )}
                        {savedTurns.has(i) ? "Saved" : "Save"}
                      </button>
                    )}
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
              <div className="flex items-center justify-between gap-2 px-2.5 pb-2">
                <span className="flex items-center gap-2 min-w-0">
                  <button
                    type="button"
                    onClick={() => fileInput.current?.click()}
                    aria-label="Attach a file"
                    title="Attach a PDF, image, CSV or Excel file"
                    className="p-1 rounded text-friday-fg-subtle hover:text-foreground transition-colors"
                  >
                    <Paperclip className="h-3.5 w-3.5" />
                  </button>
                  <input
                    ref={fileInput}
                    type="file"
                    multiple
                    accept={ACCEPT_ATTRIBUTE}
                    onChange={(e) => {
                      void attachFiles(e.target.files);
                      // Reset, or picking the same file twice is a no-op.
                      e.target.value = "";
                    }}
                    className="hidden"
                  />
                  <span className="text-[10px] text-friday-fg-subtle truncate">
                    AI Assistant · grounded in this workspace
                  </span>
                </span>
                <button
                  type="submit"
                  disabled={sending || draft.trim() === ""}
                  aria-label="Send"
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-friday-accent text-friday-accent-fg disabled:opacity-40 transition-opacity"
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

