"use client";

/**
 * The board as columns of cards — Monday's Kanban.
 *
 * Same rows, same groups, same rules as the table: one column per value of
 * the grouping column, each card an item, and moving a card between columns
 * sets that value. Grouped by phase you are moving a project through the
 * practice's stages; grouped by status you are running a stand-up.
 *
 * Dragging is the gesture people reach for, and it is the one gesture a
 * keyboard cannot perform, so every card also carries a Move menu that does
 * exactly the same thing. That is not a consolation prize — it is faster
 * than dragging across a wide board, and it is how the move is tested.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, MessageSquare, Plus } from "lucide-react";
import { cn } from "@/ui/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/ui/components/avatar";
import {
  displayValue,
  personInitials,
  type BoardCellValue,
  type BoardColumn,
  type BoardRow,
} from "./columns";
import { groupRows } from "./grouping";
import { useDismiss } from "./use-dismiss";

/**
 * Cards rendered per column before scrolling asks for more.
 *
 * A card's height depends on its content, so the exact arithmetic the table
 * uses does not apply here. Growing the list as the column is scrolled is
 * simpler and does the same job: measured at 800 projects, rendering every
 * card cost 17,214 DOM nodes.
 */
const CARDS_PER_PAGE = 30;

export type KanbanProps = {
  columns: readonly BoardColumn[];
  rows: readonly BoardRow[];
  groupBy: BoardColumn;
  canEdit?: boolean;
  canEditCell?: (row: BoardRow, column: BoardColumn) => boolean;
  canAdd?: boolean;
  onCellChange?: (rowId: string, key: string, value: BoardCellValue) => void | Promise<void>;
  onAddRow?: (groupValue: string | null, title: string) => void | Promise<void>;
  onOpenRow?: (rowId: string) => void;
  onOpenConversation?: (rowId: string) => void;
  itemNoun?: string;
  emptyNote?: string;
};

export function Kanban({
  columns,
  rows,
  groupBy,
  canEdit = false,
  canEditCell,
  canAdd = false,
  onCellChange,
  onAddRow,
  onOpenRow,
  onOpenConversation,
  itemNoun = "item",
  emptyNote = "Nothing here",
}: KanbanProps) {
  const groups = useMemo(() => groupRows(rows, groupBy), [rows, groupBy]);
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);

  /*
   * The card carries one more field than its name: whichever status column
   * is not the one forming the columns. Grouped by phase you want the work
   * status at a glance, and the other way round.
   */
  const badgeColumn = useMemo(
    () => columns.find((c) => c.kind === "status" && c.key !== groupBy.key),
    [columns, groupBy.key],
  );

  const move = useCallback(
    (rowId: string, value: string | null) => {
      if (value === null || rows.find((row) => row.id === rowId)?.cells[groupBy.key] === value) return;
      void onCellChange?.(rowId, groupBy.key, value);
    },
    [onCellChange, groupBy.key, rows],
  );

  const movable = useCallback(
    (row: BoardRow) => canEdit && (canEditCell?.(row, groupBy) ?? true),
    [canEdit, canEditCell, groupBy],
  );

  return (
    <div className="flex h-full min-h-0 gap-3 overflow-x-auto p-4">
      {groups.map((group) => {
        const key = group.value ?? "__ungrouped";
        const isOver = over === key && dragging !== null;
        return (
          <section
            key={key}
            aria-label={`${group.label}, ${group.rows.length} ${group.rows.length === 1 ? itemNoun : `${itemNoun}s`}`}
            onDragOver={(e) => {
              if (!dragging) return;
              e.preventDefault();
              setOver(key);
            }}
            onDragLeave={() => setOver((current) => (current === key ? null : current))}
            onDrop={(e) => {
              e.preventDefault();
              if (dragging) move(dragging, group.value);
              setDragging(null);
              setOver(null);
            }}
            className={cn(
              "flex w-72 shrink-0 flex-col rounded-lg border transition-colors",
              isOver
                ? "border-friday-accent bg-friday-accent-soft"
                : "border-friday-border-soft bg-friday-surface/40",
            )}
          >
            <header className="flex items-center gap-2 border-b border-friday-border-soft px-3 py-2.5">
              <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: group.color }} />
              <h3 className="flex-1 truncate text-[13px] font-semibold text-friday-fg">{group.label}</h3>
              <span className="text-[11px] text-friday-fg-subtle">{group.rows.length}</span>
            </header>

            <CardList
              rows={group.rows}
              emptyNote={emptyNote}
              renderCard={(row) => (
                <Card
                  key={row.id}
                  row={row}
                  badgeColumn={badgeColumn}
                  groups={groups.map((g) => ({ value: g.value, label: g.label, color: g.color }))}
                  currentGroup={group.value}
                  movable={movable(row)}
                  dragging={dragging === row.id}
                  onDragStart={() => setDragging(row.id)}
                  onDragEnd={() => {
                    setDragging(null);
                    setOver(null);
                  }}
                  onMove={(value) => move(row.id, value)}
                  onOpenRow={onOpenRow}
                  onOpenConversation={onOpenConversation}
                  groupLabel={groupBy.label}
                />
              )}
            />

            {canAdd && onAddRow && (
              <AddCard
                itemNoun={itemNoun}
                groupLabel={group.label}
                onAdd={(title) => onAddRow(group.value, title)}
              />
            )}
          </section>
        );
      })}
    </div>
  );
}

/**
 * One column's cards, grown as it is scrolled.
 *
 * The count resets whenever the column's contents change — a filter, a sort,
 * a card moved away — so a narrowed board never starts halfway down a list
 * it no longer has.
 */
function CardList({
  rows,
  emptyNote,
  renderCard,
}: {
  rows: readonly BoardRow[];
  emptyNote: string;
  renderCard: (row: BoardRow) => React.ReactNode;
}) {
  const [visibleCount, setVisibleCount] = useState(CARDS_PER_PAGE);
  const sentinel = useRef<HTMLLIElement>(null);

  /*
   * Start again from the top whenever the column's contents change, so a
   * narrowed board never opens halfway down a list it no longer has. Adjusted
   * during render rather than in an effect: an effect would paint the stale
   * count first, and React forbids the synchronous setState that would avoid
   * that. This is the documented way to reset state when an input changes.
   */
  const listKey = `${rows.length}:${rows[0]?.id ?? ""}`;
  const [renderedFor, setRenderedFor] = useState(listKey);
  if (renderedFor !== listKey) {
    setRenderedFor(listKey);
    setVisibleCount(CARDS_PER_PAGE);
  }

  useEffect(() => {
    const element = sentinel.current;
    if (!element || visibleCount >= rows.length) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setVisibleCount((count) => Math.min(rows.length, count + CARDS_PER_PAGE));
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [visibleCount, rows.length]);

  const remaining = rows.length - visibleCount;

  return (
    <ul className="flex-1 space-y-2 overflow-y-auto p-2">
      {rows.length === 0 && (
        <li className="px-1 py-3 text-[12px] text-friday-fg-subtle">{emptyNote}</li>
      )}
      {rows.slice(0, visibleCount).map(renderCard)}
      {remaining > 0 && (
        <li ref={sentinel} className="px-1 py-2 text-[11px] text-friday-fg-subtle">
          {remaining} more below
        </li>
      )}
    </ul>
  );
}

function Card({
  row,
  badgeColumn,
  groups,
  currentGroup,
  movable,
  dragging,
  onDragStart,
  onDragEnd,
  onMove,
  onOpenRow,
  onOpenConversation,
  groupLabel,
}: {
  row: BoardRow;
  badgeColumn?: BoardColumn;
  groups: { value: string | null; label: string; color: string }[];
  currentGroup: string | null;
  movable: boolean;
  dragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onMove: (value: string | null) => void;
  onOpenRow?: (rowId: string) => void;
  onOpenConversation?: (rowId: string) => void;
  groupLabel: string;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const ref = useDismiss<HTMLLIElement>(() => setMenuOpen(false));
  const badgeValue = badgeColumn ? String(row.cells[badgeColumn.key] ?? "") : "";

  return (
    <li
      ref={ref}
      draggable={movable}
      onDragStart={(e) => {
        if (!movable) return;
        e.dataTransfer.effectAllowed = "move";
        // Firefox refuses to start a drag unless some data is set.
        e.dataTransfer.setData("text/plain", row.id);
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      className={cn(
        "relative rounded-md border border-friday-border-soft bg-friday-bg p-2.5 shadow-sm transition-opacity",
        movable && "cursor-grab active:cursor-grabbing",
        dragging && "opacity-40",
      )}
    >
      <div className="flex items-start gap-1.5">
        {onOpenRow ? (
          <button
            type="button"
            onClick={() => onOpenRow(row.id)}
            className="min-w-0 flex-1 text-left"
          >
            <span className="block truncate text-[13px] text-friday-fg">{row.title}</span>
            {row.subtitle && (
              <span className="mt-0.5 block font-mono text-[10px] text-friday-fg-subtle">
                {row.subtitle}
              </span>
            )}
          </button>
        ) : (
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] text-friday-fg">{row.title}</span>
          </span>
        )}

        {movable && (
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            aria-label={`Move ${row.title} to another ${groupLabel.toLowerCase()}`}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            className="shrink-0 rounded-sm p-1 text-friday-fg-subtle transition-colors hover:bg-friday-surface-2 hover:text-friday-fg"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <div className="mt-2 flex items-center gap-2">
        {badgeColumn && badgeValue && (
          <span
            className="rounded px-1.5 py-0.5 text-[10px] font-semibold"
            style={{
              background: badgeColumn.colorFor?.(badgeValue) ?? "var(--friday-surface-3)",
              color: badgeColumn.onColorFor?.(badgeValue) ?? "var(--friday-bg)",
            }}
          >
            {displayValue(badgeColumn, badgeValue)}
          </span>
        )}

        <span className="flex-1" />

        {row.people.length > 0 && (
          <span aria-label={`Assigned to ${row.people.map((p) => p.name ?? "unnamed").join(", ")}`} className="flex items-center">
            {row.people.slice(0, 3).map((person, i) => (
              <Avatar key={person.id} className={cn("h-5 w-5 border border-friday-bg text-[9px]", i > 0 && "-ml-1.5")}>
                {person.image && <AvatarImage src={person.image} alt="" />}
                <AvatarFallback className="bg-friday-surface-3 text-[9px] text-friday-fg">
                  {personInitials(person)}
                </AvatarFallback>
              </Avatar>
            ))}
            {row.people.length > 3 && (
              <span className="-ml-1.5 flex h-5 w-5 items-center justify-center rounded-full border border-friday-bg bg-friday-surface-3 text-[9px] text-friday-fg">
                +{row.people.length - 3}
              </span>
            )}
          </span>
        )}

        {onOpenConversation && (
          <button
            type="button"
            onClick={() => onOpenConversation(row.id)}
            aria-label={
              row.updateCount
                ? `Updates on ${row.title}, ${row.updateCount} so far`
                : `Updates on ${row.title}`
            }
            className="flex shrink-0 items-center gap-0.5 rounded-sm p-1 text-friday-fg-subtle transition-colors hover:bg-friday-surface-2 hover:text-friday-fg"
          >
            <MessageSquare className="h-3.5 w-3.5" />
            {row.updateCount ? <span className="text-[10px]">{row.updateCount}</span> : null}
          </button>
        )}
      </div>

      {menuOpen && (
        <div
          role="menu"
          aria-label={`Move ${row.title}`}
          className="absolute right-2 top-9 z-40 w-52 overflow-hidden rounded-md border border-friday-border bg-friday-bg py-1 shadow-lg"
        >
          {groups
            .filter((g) => g.value !== null && g.value !== currentGroup)
            .map((g) => (
              <button
                key={g.value}
                type="button"
                role="menuitem"
                onClick={() => {
                  onMove(g.value);
                  setMenuOpen(false);
                }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors hover:bg-friday-surface-2"
              >
                <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ background: g.color }} />
                <span className="truncate text-[12.5px] text-friday-fg">{g.label}</span>
              </button>
            ))}
        </div>
      )}
    </li>
  );
}

function AddCard({
  itemNoun,
  groupLabel,
  onAdd,
}: {
  itemNoun: string;
  groupLabel: string;
  onAdd: (title: string) => void | Promise<void>;
}) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);

  const submit = async () => {
    const title = value.trim();
    if (!title || submitting.current) return;
    submitting.current = true;
    setBusy(true);
    try {
      await onAdd(title);
      setValue("");
    } catch {
      // The binding reports the failure; keep the title available to retry.
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-1.5 border-t border-friday-border-soft px-2.5 py-2">
      <Plus className="h-3.5 w-3.5 shrink-0 text-friday-fg-subtle" />
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") void submit();
          if (e.key === "Escape") setValue("");
        }}
        onBlur={() => void submit()}
        disabled={busy}
        aria-label={`Add ${itemNoun} to ${groupLabel}`}
        placeholder={`Add ${itemNoun}`}
        className="w-full bg-transparent text-[12.5px] text-friday-fg outline-none placeholder:text-friday-fg-subtle"
      />
    </div>
  );
}
