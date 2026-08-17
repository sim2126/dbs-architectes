"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/ui/utils";

/**
 * An inline-editable table cell.
 *
 * Click to edit. Text and number cells commit on Enter or blur; long text
 * commits on blur so Enter can insert a newline. Escape abandons the edit.
 * The value is committed optimistically — the cell shows the new value
 * immediately and reverts if the save rejects, because waiting on a
 * round-trip per cell is what makes a table feel like a form.
 *
 * Read-only callers pass `editable={false}` and get a plain cell with no
 * affordance, rather than a control that looks interactive and refuses.
 */
export function InlineCell({
  value,
  onCommit,
  editable = true,
  kind = "text",
  options,
  align = "left",
  placeholder,
  className,
}: {
  value: string | number | null | undefined;
  /** Return false to reject; the cell reverts to its previous value. */
  onCommit: (raw: string) => Promise<boolean> | boolean;
  editable?: boolean;
  kind?: "text" | "number" | "select" | "longtext";
  options?: readonly string[];
  align?: "left" | "right";
  placeholder?: string;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  // Held separately from `value` so an optimistic commit survives until the
  // parent's data catches up, without flickering back to the old value.
  const [optimistic, setOptimistic] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Adjusting state during render rather than in an effect: a new value
  // from the server supersedes any optimistic guess, and doing this in an
  // effect would schedule a second render pass on every prop change.
  const [lastValue, setLastValue] = useState(value);
  if (value !== lastValue) {
    setLastValue(value);
    setOptimistic(null);
  }

  const shown = optimistic ?? (value === null || value === undefined ? "" : String(value));

  useEffect(() => {
    if (!editing) return;
    if (kind === "longtext") textareaRef.current?.focus();
    else inputRef.current?.focus();
  }, [editing, kind]);

  const begin = () => {
    if (!editable) return;
    setDraft(shown);
    setEditing(true);
  };

  const commit = async () => {
    setEditing(false);
    if (draft === shown) return;
    const previous = shown;
    setOptimistic(draft);
    const ok = await onCommit(draft);
    if (!ok) setOptimistic(previous === "" ? null : previous);
  };

  const abandon = () => {
    setEditing(false);
    setDraft(shown);
  };

  if (!editable) {
    return (
      <div
        className={cn(
          "px-2 py-1.5 text-sm",
          kind === "longtext"
            ? "min-h-24 whitespace-pre-wrap break-words leading-relaxed"
            : "truncate",
          align === "right" && "text-right tabular-nums",
          shown === "" && "text-friday-fg-subtle",
          className,
        )}
      >
        {shown || placeholder || ""}
      </div>
    );
  }

  if (editing && kind === "select") {
    return (
      <select
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Escape") abandon();
        }}
        className={cn(
          "w-full px-2 py-1.5 text-sm bg-background border border-friday-accent rounded",
          "focus-visible:outline-none",
          className,
        )}
      >
        <option value="">—</option>
        {options?.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    );
  }

  if (editing && kind === "longtext") {
    return (
      <textarea
        ref={textareaRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            abandon();
          }
        }}
        rows={4}
        className={cn(
          "w-full min-h-24 resize-y px-2 py-1.5 text-sm leading-relaxed",
          "bg-background border border-friday-accent rounded focus-visible:outline-none",
          className,
        )}
      />
    );
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        type={kind === "number" ? "number" : "text"}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void commit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            abandon();
          }
        }}
        className={cn(
          "w-full px-2 py-1.5 text-sm bg-background border border-friday-accent rounded",
          "focus-visible:outline-none",
          align === "right" && "text-right tabular-nums",
          className,
        )}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={begin}
      // Enter from keyboard focus opens the editor, matching the click path.
      className={cn(
        "w-full text-left px-2 py-1.5 text-sm rounded",
        "hover:bg-friday-surface-2 focus-visible:outline-none",
        "focus-visible:ring-2 focus-visible:ring-ring transition-colors",
        kind === "longtext"
          ? "min-h-24 whitespace-pre-wrap break-words leading-relaxed"
          : "truncate",
        align === "right" && "text-right tabular-nums",
        shown === "" && "text-friday-fg-subtle",
        className,
      )}
    >
      {shown || placeholder || "—"}
    </button>
  );
}
