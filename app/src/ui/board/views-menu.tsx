"use client";

/**
 * Saved views, as a menu.
 *
 * The board's own arrangement is one click from being named and kept, and
 * one click from coming back. At two hundred projects this stops being a
 * convenience and becomes the way in: nobody scrolls a board that size,
 * they open the question they already asked.
 */

import { useState } from "react";
import { Bookmark, Check, Plus, Trash2 } from "lucide-react";
import { cn } from "@/ui/utils";
import type { BoardColumn } from "./columns";
import { describeView, MAX_VIEW_NAME, type SavedView } from "./saved-views";
import { useDismiss } from "./use-dismiss";

export function ViewsMenu({
  views,
  columns,
  activeId,
  onApply,
  onReset,
  onSave,
  onDelete,
}: {
  views: readonly SavedView[];
  columns: readonly BoardColumn[];
  /** The view currently applied, if the board is showing one unchanged. */
  activeId: string | null;
  onApply: (view: SavedView) => void;
  onReset: () => void;
  onSave: (name: string) => void | Promise<void>;
  onDelete: (view: SavedView) => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const ref = useDismiss<HTMLDivElement>(() => {
    setOpen(false);
    setNaming(false);
  });

  const active = views.find((v) => v.id === activeId) ?? null;

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    try {
      await onSave(trimmed);
      setName("");
      setNaming(false);
      setOpen(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={active ? `Views, showing ${active.name}` : "Views"}
        className={cn(
          "flex h-8 items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 text-[12px] transition-colors",
          active || open
            ? "bg-friday-surface-2 text-friday-fg"
            : "text-friday-fg-subtle hover:bg-friday-surface-2 hover:text-friday-fg",
        )}
      >
        <Bookmark className="h-3.5 w-3.5" />
        <span className="max-w-32 truncate">{active ? active.name : "Views"}</span>
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Saved views"
          className="absolute left-0 top-full z-40 mt-1 w-72 overflow-hidden rounded-md border border-friday-border bg-friday-bg py-1 shadow-lg"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onReset();
              setOpen(false);
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-friday-surface-2"
          >
            <span className="flex-1 text-[12.5px] text-friday-fg">All projects</span>
            {activeId === null && <Check className="h-3 w-3 shrink-0 text-friday-accent" />}
          </button>

          {views.length > 0 && <div className="my-1 border-t border-friday-border-soft" />}

          <div className="max-h-64 overflow-y-auto">
            {views.map((view) => (
              <div
                key={view.id}
                className="group flex items-center transition-colors hover:bg-friday-surface-2"
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    onApply(view);
                    setOpen(false);
                  }}
                  className="min-w-0 flex-1 px-3 py-2 text-left"
                >
                  <span className="flex items-center gap-2">
                    <span className="flex-1 truncate text-[12.5px] text-friday-fg">{view.name}</span>
                    {view.id === activeId && <Check className="h-3 w-3 shrink-0 text-friday-accent" />}
                  </span>
                  <span className="mt-0.5 block truncate text-[10.5px] text-friday-fg-subtle">
                    {describeView(view.state, columns)}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => void onDelete(view)}
                  aria-label={`Delete the view ${view.name}`}
                  className="mr-2 shrink-0 rounded p-1.5 text-friday-fg-subtle opacity-0 transition-opacity hover:text-friday-error-fg focus-visible:opacity-100 group-hover:opacity-100"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>

          <div className="mt-1 border-t border-friday-border-soft pt-1">
            {naming ? (
              <div className="flex items-center gap-1 px-3 py-1.5">
                <input
                  value={name}
                  maxLength={MAX_VIEW_NAME}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void submit();
                    if (e.key === "Escape") {
                      setNaming(false);
                      setName("");
                    }
                  }}
                  disabled={busy}
                  aria-label="Name for this view"
                  placeholder="Name this view"
                  className="h-7 w-full rounded border border-friday-accent bg-friday-bg px-2 text-[12.5px] text-friday-fg outline-none placeholder:text-friday-fg-subtle"
                />
              </div>
            ) : (
              <button
                type="button"
                role="menuitem"
                onClick={() => setNaming(true)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-[12.5px] text-friday-fg-subtle transition-colors hover:bg-friday-surface-2 hover:text-friday-fg"
              >
                <Plus className="h-3.5 w-3.5" />
                Save this view
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
