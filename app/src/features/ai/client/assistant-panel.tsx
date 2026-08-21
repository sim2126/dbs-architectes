"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowUp,
  ChevronsRight,
  Loader2,
  PanelRightClose,
  Search,
  Sparkles,
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
 * DBS GPT, as a docked panel rather than a page.
 *
 * The point of docking it is context: asking "what changed on Belvédère" is
 * far more useful while looking at Belvédère than after navigating away to a
 * separate assistant screen. That is also why this replaces the sidebar nav
 * entry — a destination you have to leave your work to reach gets used once.
 *
 * Every message routes through /api/agent, which is the grounded agent with
 * ID resolution and post-generation validation. The intent chips are prompt
 * presets into that same path, not separate models or separate prompts with
 * their own ungrounded behaviour.
 */

type Turn = { role: "user" | "assistant"; content: string };

export function AssistantPanel() {
  const open = useAssistantStore((s) => s.open);
  const setOpen = useAssistantStore((s) => s.setOpen);
  const width = useAssistantStore((s) => s.width);
  const setWidth = useAssistantStore((s) => s.setWidth);

  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [dragging, setDragging] = useState(false);
  const sessionId = useRef<string | null>(null);
  const liveWidth = useRef(width);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // ── Resize ──────────────────────────────────────────────────────
  // Committed on pointer-up rather than per-frame: a drag would otherwise
  // write to localStorage on every animation frame.
  useEffect(() => {
    if (!dragging) return;
    const move = (e: PointerEvent) => {
      const next = Math.min(
        ASSISTANT_MAX_WIDTH,
        Math.max(ASSISTANT_MIN_WIDTH, window.innerWidth - e.clientX),
      );
      liveWidth.current = next;
      document.documentElement.style.setProperty("--assistant-w", `${next}px`);
    };
    const up = () => {
      setDragging(false);
      setWidth(liveWidth.current);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    const prevSelect = document.body.style.userSelect;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      document.body.style.userSelect = prevSelect;
      document.body.style.cursor = "";
    };
  }, [dragging, setWidth]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [turns, sending]);

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
          body: JSON.stringify({
            message,
            sessionId: sessionId.current ?? undefined,
          }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          showToast(body?.error ?? "The assistant could not answer.", "danger");
          // Drop the optimistic user turn — leaving it implies it was sent
          // and answered, which it was not.
          setTurns((t) => t.slice(0, -1));
          return;
        }
        const data = (await res.json()) as {
          reply?: string;
          content?: string;
          sessionId?: string;
        };
        if (data.sessionId) sessionId.current = data.sessionId;
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
    [sending],
  );

  if (!open) return null;

  const isEmpty = turns.length === 0;

  return (
    <aside
      style={{ width }}
      className="relative shrink-0 h-full flex flex-col border-l border-border bg-card"
      aria-label="DBS GPT"
    >
      {/* Resize handle — keyboard-operable, not pointer-only. */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize assistant panel"
        aria-valuenow={width}
        aria-valuemin={ASSISTANT_MIN_WIDTH}
        aria-valuemax={ASSISTANT_MAX_WIDTH}
        tabIndex={0}
        onPointerDown={(e) => {
          e.preventDefault();
          liveWidth.current = width;
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
          "absolute inset-y-0 left-0 z-30 w-1 cursor-col-resize transition-colors",
          "hover:bg-friday-accent-ring focus-visible:bg-friday-accent-ring",
          "focus-visible:outline-none",
          dragging && "bg-friday-accent-ring",
        )}
      />

      <header className="h-14 shrink-0 flex items-center justify-between gap-2 px-4 border-b border-border">
        <span className="flex items-center gap-2 min-w-0">
          <Sparkles className="h-4 w-4 text-friday-accent shrink-0" />
          <span className="text-sm font-semibold truncate">DBS GPT</span>
        </span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Close assistant"
          className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        >
          <PanelRightClose className="h-4 w-4" />
        </button>
      </header>

      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-4 py-4">
        {isEmpty ? (
          <div className="h-full flex flex-col items-center justify-center text-center px-2">
            <Sparkles className="h-7 w-7 text-friday-accent" strokeWidth={1.5} />
            <h2 className="font-display italic text-foreground text-2xl mt-3">
              Your assistant
            </h2>
            <p className="text-sm text-muted-foreground mt-2 leading-relaxed max-w-[26ch]">
              Ask about projects, people or deadlines. Answers are grounded in
              this workspace.
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
                    "inline-block text-left text-sm leading-relaxed rounded-lg px-3 py-2 max-w-[90%] whitespace-pre-wrap break-words",
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

      {/* Intent chips — prompt presets into the same grounded agent. */}
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
              // Enter sends; Shift+Enter is a newline. The composer default
              // people expect from every chat surface.
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
    </aside>
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
