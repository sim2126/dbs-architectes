// Friday command palette — Cmd-K modal. Two sections: Recent / Results
// (projects, threads, people) and Suggested actions. Arrow keys to
// navigate, Enter to act, Esc to close. Esc + ⌘K wiring is handled by
// the shell (`<FridayShell>`); this component is purely controlled.

"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/friday/modal";
import { I } from "@/components/friday/icons";
import { EmptyState } from "@/components/friday/empty-state";
import { cn } from "@/lib/utils";

interface PaletteResult {
  kind: "project" | "thread" | "people";
  t: string;
  sub: string;
  action: string;
}

interface PaletteAction {
  kind: "action";
  t: string;
  kbd: string;
  action: string;
}

// TODO: replace these stubs with a real `/api/search` endpoint that
// scores projects/threads/people by recency + match. For now we hardcode
// a small, plausibly-DBS demo set so the palette is useful from day one.
const DEMO_RESULTS: PaletteResult[] = [
  { kind: "project", t: "Le Saillen", sub: "DBS-2025-001 · Phase 41 — DAP", action: "open:project:DBS-2025-001" },
  { kind: "project", t: "Lamberson Buildings", sub: "DBS-2024-002 · Phase 31 — Avant-projet", action: "open:project:DBS-2024-002" },
  { kind: "project", t: "Banque Cantonale du Valais", sub: "DBS-2023-002 · Phase 52 — Réalisation", action: "open:project:DBS-2023-002" },
  { kind: "project", t: "Crans Carlton", sub: "DBS-2018-001 · Phase 53 — Mise en service", action: "open:project:DBS-2018-001" },
  { kind: "thread", t: "Coordination MEP — réunion 14 mai", sub: "Le Saillen · 14 msgs", action: "open:thread:t1" },
  { kind: "people", t: "Luigi Di Berardino", sub: "Director · LD", action: "open:user:LD" },
  { kind: "people", t: "Florencia Schilling", sub: "Associate · FS", action: "open:user:FS" },
];

const DEMO_ACTIONS: PaletteAction[] = [
  { kind: "action", t: "Open meeting summary — Le Saillen / 03 mai", kbd: "↵", action: "meeting:m1" },
  { kind: "action", t: "Start a call with Luigi Di Berardino", kbd: "⌘C", action: "call:LD" },
  { kind: "action", t: "Plan next phase with Planning AI", kbd: "⌘P", action: "ai:plan" },
];

export function CommandPalette({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [q, setQ] = React.useState("");
  const [sel, setSel] = React.useState(0);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (!open) return;
    setQ("");
    setSel(0);
    const t = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, [open]);

  const filtered: PaletteResult[] = React.useMemo(() => {
    if (!q.trim()) return DEMO_RESULTS.slice(0, 4);
    const lower = q.toLowerCase();
    return DEMO_RESULTS.filter(
      (it) =>
        it.t.toLowerCase().includes(lower) ||
        it.sub.toLowerCase().includes(lower),
    );
  }, [q]);

  const showActions = !q.trim();
  const flatList: (PaletteResult | PaletteAction)[] = showActions
    ? [...filtered, ...DEMO_ACTIONS]
    : filtered;

  const handleAction = React.useCallback(
    (action: string) => {
      onClose();
      // Route mappings — extend as the palette gains more capabilities.
      if (action.startsWith("open:project:")) {
        const code = action.replace("open:project:", "");
        router.push(`/dashboard/projects?code=${encodeURIComponent(code)}`);
      } else if (action.startsWith("ai:plan")) {
        router.push("/dashboard/ai/planning");
      }
      // Other actions (open:thread, open:user, meeting:, call:) are
      // intentionally no-ops until those surfaces accept deep links.
    },
    [onClose, router],
  );

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSel((s) => Math.min(s + 1, flatList.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSel((s) => Math.max(s - 1, 0));
      } else if (e.key === "Enter" && flatList[sel]) {
        handleAction(flatList[sel].action);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, sel, flatList, handleAction]);

  return (
    <Modal open={open} onClose={onClose} width={560} align="top">
      <div className="flex items-center gap-2.5 px-4 py-3.5 border-b border-friday-border-soft">
        <I.Search size={14} className="text-friday-fg-muted" />
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setSel(0);
          }}
          placeholder="Search projects, people, threads — or type / for commands"
          className="flex-1 bg-transparent border-0 outline-none text-[13.5px] text-friday-fg"
        />
        <span className="font-mono text-[9.5px] text-friday-fg-subtle border border-friday-border-soft px-1.5 rounded-sm leading-tight">
          esc
        </span>
      </div>

      <div className="max-h-[380px] overflow-y-auto">
        <div className="px-4 pt-2.5 pb-1 text-[9.5px] uppercase tracking-[0.18em] text-friday-fg-subtle font-semibold">
          {q.trim() ? `Results · ${filtered.length}` : "Recent"}
        </div>

        {filtered.length === 0 ? (
          <div className="px-4 pb-4 pt-3">
            <EmptyState
              title="Nothing matches"
              description={`No projects, people, or threads match "${q}". Try a project code or last name.`}
            />
          </div>
        ) : (
          filtered.map((it, i) => {
            const focused = sel === i;
            return (
              <button
                key={`${it.kind}-${i}`}
                type="button"
                onClick={() => handleAction(it.action)}
                onMouseEnter={() => setSel(i)}
                className={cn(
                  "relative flex items-center gap-3 px-4 py-2 w-full bg-transparent border-0 cursor-pointer text-left",
                  focused ? "bg-friday-surface-2" : "",
                )}
              >
                {focused ? (
                  <span className="absolute left-0 top-1 bottom-1 w-0.5 bg-friday-accent" />
                ) : null}
                {it.kind === "project" ? (
                  <I.Folder size={13} className="text-friday-fg-muted" />
                ) : it.kind === "thread" ? (
                  <I.Chat size={13} className="text-friday-fg-muted" />
                ) : (
                  <I.Users size={13} className="text-friday-fg-muted" />
                )}
                <div className="flex flex-col flex-1 min-w-0 gap-px">
                  <span
                    className={cn(
                      "text-[12.5px] text-friday-fg",
                      focused ? "font-medium" : "",
                    )}
                  >
                    {it.t}
                  </span>
                  <span className="font-mono text-[10.5px] text-friday-fg-muted truncate">
                    {it.sub}
                  </span>
                </div>
                <span className="font-mono text-[9px] text-friday-fg-subtle uppercase tracking-wide">
                  {it.kind}
                </span>
              </button>
            );
          })
        )}

        {showActions ? (
          <>
            <div className="px-4 pt-2.5 pb-1 mt-1 border-t border-friday-border-soft text-[9.5px] uppercase tracking-[0.18em] text-friday-fg-subtle font-semibold">
              Suggested actions
            </div>
            {DEMO_ACTIONS.map((it, i) => {
              const idx = filtered.length + i;
              const focused = sel === idx;
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => handleAction(it.action)}
                  onMouseEnter={() => setSel(idx)}
                  className={cn(
                    "relative flex items-center gap-3 px-4 py-2 w-full bg-transparent border-0 cursor-pointer text-left",
                    focused ? "bg-friday-surface-2" : "",
                  )}
                >
                  {focused ? (
                    <span className="absolute left-0 top-1 bottom-1 w-0.5 bg-friday-accent" />
                  ) : null}
                  <I.ArrowRight size={13} className="text-friday-fg-muted" />
                  <span className="flex-1 text-[12.5px] text-friday-fg">{it.t}</span>
                  <span className="font-mono text-[9.5px] text-friday-fg-subtle border border-friday-border-soft px-1.5 rounded-sm leading-tight">
                    {it.kbd}
                  </span>
                </button>
              );
            })}
          </>
        ) : null}
      </div>

      <div className="flex gap-3.5 px-4 py-2 border-t border-friday-border-soft bg-friday-bg font-mono text-[9.5px] text-friday-fg-subtle">
        <span>↑↓ navigate</span>
        <span>↵ select</span>
        <span>⌘K toggle</span>
        <div className="flex-1" />
        <span>FRIDAY · v0.4</span>
      </div>
    </Modal>
  );
}
