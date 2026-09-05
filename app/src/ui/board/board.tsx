"use client";

/**
 * The board: Monday's table, in Friday's language.
 *
 * What makes a Monday board a board rather than a spreadsheet, and what this
 * component therefore implements:
 *
 *  - Rows live in coloured, collapsible groups that carry a count.
 *  - The first column is the row's identity, sticky while the rest scrolls.
 *  - A status cell is a full-bleed colour, edited by picking from a palette.
 *  - Every cell commits the moment you leave it. There is no Save button.
 *  - A group ends in a footer that summarises each column, with the status
 *    distribution as a bar.
 *  - Selecting rows raises one bulk action bar.
 *  - A row opens into a panel where its conversation lives.
 *
 * It is a real `<table>`, not a grid of divs. The first attempt used divs
 * with role="row" and role="gridcell", which axe rejected outright: 49
 * critical violations, because an ARIA grid has structural obligations that
 * are easy to state and easy to get wrong. Native table elements carry the
 * same meaning correctly by construction — a group is a `<tbody>`, the item
 * cell is a row header — and they cannot drift as the markup changes.
 *
 * Presentational only: it is handed rows and told what to call. It knows
 * nothing about projects, Prisma or fetch — which is why it lives in ui/
 * rather than in a feature. The pure parts (grouping, summaries, selection)
 * sit beside it in this folder and are tested there.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronRight,
  MessageSquare,
  Maximize2,
  Plus,
  X,
} from "lucide-react";
import { cn } from "@/ui/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/ui/components/avatar";
import {
  displayValue,
  isEditable,
  personInitials,
  type BoardCellValue,
  type BoardColumn,
  type BoardColumnKind,
  type BoardPerson,
  type BoardRow,
} from "./columns";
import { columnSummary, groupRows, statusDistribution } from "./grouping";
import { useDismiss } from "./use-dismiss";
import {
  cycleSort,
  EMPTY_VIEW,
  moveColumn,
  reorderColumn,
  resetColumnWidth,
  setColumnWidth,
  toggleHidden,
  type BoardView,
} from "./view-state";
import {
  groupCheckState,
  pruneSelection,
  selectRange,
  selectionLabel,
  toggle,
  toggleGroup,
} from "./selection";

// ── Shared metrics ───────────────────────────────────────────────────────────
// Monday's board is a fixed grid: every row the same height, every column an
// explicit width, so the sticky first column and the group footers line up.

const ROW_H = 36;
const CHECK_W = 34;
const ITEM_W = 300;
const ACTIONS_W = 62;

export type BulkAction = {
  label: string;
  /** Given the selected row ids. Returning a promise keeps the bar disabled. */
  run: (ids: string[]) => void | Promise<void>;
  /** Choices rendered as a submenu, e.g. which status to set. */
  options?: readonly { value: string; label: string; color?: string }[];
  runOption?: (ids: string[], value: string) => void | Promise<void>;
  tone?: "default" | "danger";
};

export type BoardProps = {
  columns: readonly BoardColumn[];
  rows: readonly BoardRow[];
  /** The column whose value forms the groups. Usually also in `columns`. */
  groupBy: BoardColumn;
  /** Names the table for a screen reader, e.g. "Projects". */
  label?: string;
  /** Roster for the people picker. Empty disables assigning. */
  roster?: readonly BoardPerson[];
  canEdit?: boolean;
  /**
   * Whether this particular cell may be changed. Called for every cell, so
   * a board whose rights differ row by row — one project you lead, another
   * you only watch — greys exactly the right cells instead of offering an
   * edit that the server will refuse. Defaults to `canEdit` for all.
   */
  canEditCell?: (row: BoardRow, column: BoardColumn) => boolean;
  canAdd?: boolean;
  /** Commit one cell. Throwing or rejecting is the caller's to surface. */
  onCellChange?: (rowId: string, key: string, value: BoardCellValue) => void | Promise<void>;
  onAssign?: (rowId: string, userId: string, action: "add" | "remove") => void | Promise<void>;
  onAddRow?: (groupValue: string | null, title: string) => void | Promise<void>;
  /**
   * Drop a row into another group, which means setting its grouping value.
   * Dragging is the only gesture here a keyboard cannot perform; the
   * grouping column's own cell menu does the same thing and is reachable,
   * so nothing is only-draggable.
   */
  onMoveRow?: (rowId: string, groupValue: string | null) => void | Promise<void>;
  onOpenRow?: (rowId: string) => void;
  onOpenConversation?: (rowId: string) => void;
  bulkActions?: readonly BulkAction[];
  itemNoun?: string;
  emptyNote?: string;
  /**
   * The viewer's arrangement — sort, order, widths, hidden columns. Supplying
   * it puts a menu on every column header and a resize grip on its edge;
   * leaving it out gives a board whose columns are fixed.
   */
  view?: BoardView;
  onViewChange?: (view: BoardView) => void;
  /**
   * Every column the board has, including hidden ones. `columns` is what is
   * on screen; this is what the arrangement is computed against, so that
   * unhiding a column returns it to its place rather than to the end.
   */
  allColumns?: readonly BoardColumn[];
};

export function Board({
  columns,
  rows,
  groupBy,
  label = "Board",
  roster = [],
  canEdit = false,
  canEditCell,
  canAdd = false,
  onCellChange,
  onAssign,
  onAddRow,
  onMoveRow,
  onOpenRow,
  onOpenConversation,
  bulkActions = [],
  itemNoun = "item",
  emptyNote = "Nothing here yet",
  view,
  onViewChange,
  allColumns,
}: BoardProps) {
  const groups = useMemo(() => groupRows(rows, groupBy), [rows, groupBy]);
  const orderedIds = useMemo(() => groups.flatMap((g) => g.rows.map((r) => r.id)), [groups]);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [dragging, setDragging] = useState<string | null>(null);
  const [overGroup, setOverGroup] = useState<string | null>(null);
  const [rawSelection, setSelection] = useState<ReadonlySet<string>>(new Set());
  const anchor = useRef<string | null>(null);

  /*
   * A filter or a delete must not leave the bulk bar counting rows nobody can
   * see, so the selection is narrowed to what is on screen as it is read
   * rather than corrected afterwards in an effect. Deriving it means there is
   * no render in which the two disagree.
   */
  const selection = useMemo(() => pruneSelection(rawSelection, orderedIds), [rawSelection, orderedIds]);

  // Handlers below are rebuilt every render, so they close over the current
  // arrangement. A resize drag holds the one it started with, which is right:
  // nothing else can change while a pointer is held down.
  const current = view ?? EMPTY_VIEW;
  const arrangeable = Boolean(view && onViewChange);
  const columnUniverse = allColumns ?? columns;

  const totalWidth = CHECK_W + ITEM_W + ACTIONS_W + columns.reduce((sum, c) => sum + c.width, 0);
  const columnCount = columns.length + 3;

  const onRowCheck = useCallback(
    (rowId: string, shiftKey: boolean) => {
      setSelection((prev) =>
        shiftKey && anchor.current
          ? selectRange(prev, orderedIds, anchor.current, rowId)
          : toggle(prev, rowId),
      );
      anchor.current = rowId;
    },
    [orderedIds],
  );

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex-1 overflow-auto">
        {/* border-separate, not collapse: sticky cells misbehave under a
            collapsed border model, and each cell paints its own edge. */}
        <table
          aria-label={label}
          className="border-separate border-spacing-0 text-left"
          style={{ minWidth: totalWidth, tableLayout: "fixed" }}
        >
          <colgroup>
            <col style={{ width: CHECK_W }} />
            <col style={{ width: ITEM_W }} />
            {columns.map((column) => (
              <col key={column.key} style={{ width: column.width }} />
            ))}
            <col style={{ width: ACTIONS_W }} />
          </colgroup>

          <thead>
            <tr className="h-9">
              <th scope="col" className="sticky top-0 z-20 border-b border-friday-border bg-friday-bg">
                <span className="sr-only">Select</span>
              </th>
              <th
                scope="col"
                className="sticky left-0 top-0 z-30 border-b border-friday-border bg-friday-bg px-3 font-mono text-[9.5px] font-normal uppercase tracking-[0.18em] text-friday-fg-subtle"
              >
                Item
              </th>
              {columns.map((column) => (
                <ColumnHeader
                  key={column.key}
                  column={column}
                  sort={view?.sort ?? null}
                  arrangeable={arrangeable}
                  onSort={() => onViewChange?.(cycleSort(current, column.key))}
                  onMove={(direction) =>
                    onViewChange?.(moveColumn(current, columnUniverse, column.key, direction))
                  }
                  onReorder={(beforeKey) =>
                    onViewChange?.(reorderColumn(current, columnUniverse, column.key, beforeKey))
                  }
                  onResize={(width) => onViewChange?.(setColumnWidth(current, column.key, width))}
                  onResetWidth={() => onViewChange?.(resetColumnWidth(current, column.key))}
                  onHide={() => onViewChange?.(toggleHidden(current, column.key))}
                />
              ))}
              <th scope="col" className="sticky top-0 z-20 border-b border-friday-border bg-friday-bg">
                <span className="sr-only">Updates</span>
              </th>
            </tr>
          </thead>

          {groups.map((group) => {
            const key = group.value ?? "__ungrouped";
            const isCollapsed = collapsed.has(key);
            const groupIds = group.rows.map((r) => r.id);
            const isOver = overGroup === key && dragging !== null;
            return (
              <tbody
                key={key}
                onDragOver={(e) => {
                  if (!dragging) return;
                  e.preventDefault();
                  setOverGroup(key);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragging) void onMoveRow?.(dragging, group.value);
                  setDragging(null);
                  setOverGroup(null);
                }}
                className={cn(isOver && "bg-friday-accent-soft/40")}
              >
                <tr>
                  <th scope="colgroup" colSpan={columnCount} className="sticky left-0 pb-1 pt-4 font-normal">
                    <GroupHeader
                      label={group.label}
                      color={group.color}
                      count={group.rows.length}
                      itemNoun={itemNoun}
                      collapsed={isCollapsed}
                      checkState={groupCheckState(selection, groupIds)}
                      onToggleCollapse={() =>
                        setCollapsed((prev) => {
                          const next = new Set(prev);
                          if (next.has(key)) next.delete(key);
                          else next.add(key);
                          return next;
                        })
                      }
                      onToggleSelect={() => setSelection((prev) => toggleGroup(prev, groupIds))}
                    />
                  </th>
                </tr>

                {!isCollapsed && (
                  <>
                    {group.rows.map((row) => (
                      <BoardRowView
                        key={row.id}
                        row={row}
                        columns={columns}
                        color={group.color}
                        selected={selection.has(row.id)}
                        canEdit={canEdit}
                        canEditCell={canEditCell}
                        draggable={Boolean(onMoveRow) && canEdit && (canEditCell?.(row, groupBy) ?? true)}
                        dragging={dragging === row.id}
                        onDragStart={() => setDragging(row.id)}
                        onDragEnd={() => {
                          setDragging(null);
                          setOverGroup(null);
                        }}
                        roster={roster}
                        onCheck={onRowCheck}
                        onCellChange={onCellChange}
                        onAssign={onAssign}
                        onOpenRow={onOpenRow}
                        onOpenConversation={onOpenConversation}
                      />
                    ))}

                    {group.rows.length === 0 && (
                      <tr style={{ height: ROW_H }}>
                        <td
                          colSpan={columnCount}
                          className="border-b border-friday-border-soft bg-friday-bg px-4 text-[12px] text-friday-fg-subtle"
                        >
                          {emptyNote}
                        </td>
                      </tr>
                    )}

                    {canAdd && onAddRow && (
                      <AddRow
                        color={group.color}
                        itemNoun={itemNoun}
                        groupLabel={group.label}
                        columnCount={columnCount}
                        onAdd={(title) => onAddRow(group.value, title)}
                      />
                    )}

                    <SummaryRow columns={columns} rows={group.rows} />
                  </>
                )}
              </tbody>
            );
          })}
        </table>
      </div>

      {selection.size > 0 && (
        <BulkBar
          count={selection.size}
          itemNoun={itemNoun}
          actions={bulkActions}
          ids={[...selection]}
          onClear={() => setSelection(new Set())}
        />
      )}
    </div>
  );
}

// ── Column header ────────────────────────────────────────────────────────────

/**
 * A column header that can be sorted, moved, resized and put away.
 *
 * Dragging the header reorders it and dragging its right edge resizes it —
 * both mouse gestures — so the menu carries the same four actions in words.
 * A column arrangement nobody can reach from a keyboard is a column
 * arrangement half the practice cannot use.
 */
function ColumnHeader({
  column,
  sort,
  arrangeable,
  onSort,
  onMove,
  onReorder,
  onResize,
  onResetWidth,
  onHide,
}: {
  column: BoardColumn;
  sort: BoardView["sort"];
  arrangeable: boolean;
  onSort: () => void;
  onMove: (direction: "left" | "right") => void;
  onReorder: (beforeKey: string) => void;
  onResize: (width: number) => void;
  onResetWidth: () => void;
  onHide: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useDismiss<HTMLTableCellElement>(useCallback(() => setOpen(false), []));
  const sorted = sort?.key === column.key ? sort.direction : null;

  const startResize = (e: React.PointerEvent<HTMLSpanElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startWidth = column.width;
    const onMovePointer = (ev: PointerEvent) => onResize(startWidth + ev.clientX - startX);
    const onUp = () => {
      window.removeEventListener("pointermove", onMovePointer);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMovePointer);
    window.addEventListener("pointerup", onUp);
  };

  return (
    <th
      ref={ref}
      scope="col"
      draggable={arrangeable}
      onDragStart={(e) => {
        if (!arrangeable) return;
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("application/x-board-column", column.key);
        e.dataTransfer.setData("text/plain", column.key);
      }}
      onDragOver={(e) => {
        if (arrangeable && e.dataTransfer.types.includes("application/x-board-column")) {
          e.preventDefault();
        }
      }}
      onDrop={(e) => {
        const moved = e.dataTransfer.getData("application/x-board-column");
        if (!moved || moved === column.key) return;
        e.preventDefault();
        onReorder(column.key);
      }}
      className="sticky top-0 z-20 border-b border-l border-friday-border-soft bg-friday-bg p-0 font-normal"
    >
      <span className="relative flex h-9 items-center">
        <button
          type="button"
          disabled={!arrangeable}
          onClick={() => setOpen((o) => !o)}
          aria-haspopup={arrangeable ? "menu" : undefined}
          aria-expanded={arrangeable ? open : undefined}
          aria-label={
            arrangeable
              ? `${column.label} column options${sorted ? `, sorted ${sorted === "asc" ? "ascending" : "descending"}` : ""}`
              : undefined
          }
          className="flex min-w-0 flex-1 items-center gap-1 px-3 text-left font-mono text-[9.5px] uppercase tracking-[0.18em] text-friday-fg-subtle transition-colors hover:text-friday-fg disabled:hover:text-friday-fg-subtle"
        >
          <span className="truncate">{column.label}</span>
          {sorted && <span aria-hidden className="text-friday-accent">{sorted === "asc" ? "↑" : "↓"}</span>}
        </button>

        {arrangeable && (
          <span
            aria-hidden
            onPointerDown={startResize}
            onDragStart={(e) => e.preventDefault()}
            className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-friday-accent"
          />
        )}
      </span>

      {open && (
        <div
          role="menu"
          aria-label={`${column.label} column`}
          className="absolute left-0 top-full z-40 w-48 overflow-hidden rounded-md border border-friday-border bg-friday-bg py-1 shadow-lg"
        >
          {[
            { label: sorted === "asc" ? "Sort descending" : "Sort ascending", run: onSort },
            { label: "Move left", run: () => onMove("left") },
            { label: "Move right", run: () => onMove("right") },
            { label: "Wider", run: () => onResize(column.width + 40), keepOpen: true },
            { label: "Narrower", run: () => onResize(column.width - 40), keepOpen: true },
            { label: "Reset width", run: onResetWidth },
            { label: "Hide column", run: onHide },
          ].map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              onClick={() => {
                item.run();
                if (!item.keepOpen) setOpen(false);
              }}
              className="flex w-full items-center px-3 py-1.5 text-left text-[12.5px] normal-case tracking-normal text-friday-fg transition-colors hover:bg-friday-surface-2"
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </th>
  );
}

// ── Group header ─────────────────────────────────────────────────────────────

function GroupHeader({
  label,
  color,
  count,
  itemNoun,
  collapsed,
  checkState,
  onToggleCollapse,
  onToggleSelect,
}: {
  label: string;
  color: string;
  count: number;
  itemNoun: string;
  collapsed: boolean;
  checkState: "none" | "some" | "all";
  onToggleCollapse: () => void;
  onToggleSelect: () => void;
}) {
  return (
    <span className="flex items-center gap-2 pl-2">
      <Checkbox state={checkState} label={`Select all in ${label}`} onChange={onToggleSelect} />
      <button
        type="button"
        onClick={onToggleCollapse}
        aria-expanded={!collapsed}
        className="flex items-center gap-1.5 rounded-sm px-1 py-0.5 transition-colors hover:bg-friday-surface-2"
      >
        {collapsed ? (
          <ChevronRight className="h-3.5 w-3.5" style={{ color }} />
        ) : (
          <ChevronDown className="h-3.5 w-3.5" style={{ color }} />
        )}
        {/*
         * Monday colours the group's name itself. Ours cannot: these are pill
         * background colours, and the palest of them measured 2.18:1 as text
         * on the cream ground. The colour rides on the chevron and the bar
         * down the left of each row, which are graphics; the name stays
         * readable. This also means a colour added later cannot reintroduce
         * the problem.
         */}
        <span className="text-[13.5px] font-semibold text-friday-fg">{label}</span>
      </button>
      <span className="text-[11px] text-friday-fg-subtle">
        {count} {count === 1 ? itemNoun : `${itemNoun}s`}
      </span>
    </span>
  );
}

// ── Row ──────────────────────────────────────────────────────────────────────

function BoardRowView({
  row,
  columns,
  color,
  selected,
  canEdit,
  canEditCell,
  draggable,
  dragging,
  onDragStart,
  onDragEnd,
  roster,
  onCheck,
  onCellChange,
  onAssign,
  onOpenRow,
  onOpenConversation,
}: {
  row: BoardRow;
  columns: readonly BoardColumn[];
  color: string;
  selected: boolean;
  canEdit: boolean;
  canEditCell?: BoardProps["canEditCell"];
  draggable: boolean;
  dragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  roster: readonly BoardPerson[];
  onCheck: (rowId: string, shiftKey: boolean) => void;
  onCellChange?: BoardProps["onCellChange"];
  onAssign?: BoardProps["onAssign"];
  onOpenRow?: (rowId: string) => void;
  onOpenConversation?: (rowId: string) => void;
}) {
  const rowBg = selected ? "bg-friday-accent-soft" : "bg-friday-bg group-hover:bg-friday-surface/60";

  return (
    <tr
      draggable={draggable}
      onDragStart={(e) => {
        if (!draggable) return;
        e.dataTransfer.effectAllowed = "move";
        // Firefox will not begin a drag unless some data is set.
        e.dataTransfer.setData("text/plain", row.id);
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      className={cn(
        "group transition-colors",
        selected ? "bg-friday-accent-soft" : "hover:bg-friday-surface/60",
        dragging && "opacity-40",
      )}
      style={{ height: ROW_H }}
    >
      <td className="border-b border-friday-border-soft text-center">
        <Checkbox
          state={selected ? "all" : "none"}
          label={`Select ${row.title}`}
          onChange={(shiftKey) => onCheck(row.id, shiftKey)}
        />
      </td>

      {/* The row's identity: a row header, sticky while the rest scrolls. */}
      <th
        scope="row"
        className={cn(
          "sticky left-0 z-10 border-b border-r border-friday-border-soft p-0 font-normal",
          rowBg,
        )}
      >
        <span className="flex items-center gap-2 pr-2" style={{ height: ROW_H }}>
          <span aria-hidden className="h-full w-0.75 shrink-0" style={{ background: color }} />
          <span className="min-w-0 flex-1 truncate text-[13px] text-friday-fg">
            {row.title}
            {row.subtitle && (
              <span className="ml-2 font-mono text-[10px] text-friday-fg-subtle">{row.subtitle}</span>
            )}
          </span>
          {onOpenRow && (
            <button
              type="button"
              onClick={() => onOpenRow(row.id)}
              aria-label={`Open ${row.title}`}
              className="shrink-0 rounded-sm p-1 text-friday-fg-subtle opacity-0 transition-opacity hover:bg-friday-surface-2 hover:text-friday-fg focus-visible:opacity-100 group-hover:opacity-100"
            >
              <Maximize2 className="h-3 w-3" />
            </button>
          )}
        </span>
      </th>

      {columns.map((column) => (
        <Cell
          key={column.key}
          row={row}
          column={column}
          canEdit={canEdit && isEditable(column) && (canEditCell?.(row, column) ?? true)}
          roster={roster}
          onCellChange={onCellChange}
          onAssign={onAssign}
        />
      ))}

      <td className="border-b border-friday-border-soft text-center">
        {onOpenConversation && (
          <button
            type="button"
            onClick={() => onOpenConversation(row.id)}
            aria-label={
              row.updateCount
                ? `Updates on ${row.title}, ${row.updateCount} so far`
                : `Updates on ${row.title}`
            }
            className="relative rounded-sm p-1.5 text-friday-fg-subtle transition-colors hover:bg-friday-surface-2 hover:text-friday-fg"
          >
            <MessageSquare className="h-3.5 w-3.5" />
            {row.updateCount ? (
              <span
                aria-hidden
                className="absolute -right-0.5 -top-0.5 flex h-3 min-w-3 items-center justify-center rounded-full bg-friday-accent px-0.75 text-[8px] font-bold text-white"
              >
                {row.updateCount > 9 ? "9+" : row.updateCount}
              </span>
            ) : null}
          </button>
        )}
      </td>
    </tr>
  );
}

// ── Cells ────────────────────────────────────────────────────────────────────

function Cell({
  row,
  column,
  canEdit,
  roster,
  onCellChange,
  onAssign,
}: {
  row: BoardRow;
  column: BoardColumn;
  canEdit: boolean;
  roster: readonly BoardPerson[];
  onCellChange?: BoardProps["onCellChange"];
  onAssign?: BoardProps["onAssign"];
}) {
  const commit = useCallback(
    (value: BoardCellValue) => {
      if (String(value ?? "") === String(row.cells[column.key] ?? "")) return;
      void onCellChange?.(row.id, column.key, value);
    },
    [onCellChange, row.id, row.cells, column.key],
  );

  if (column.kind === "people") {
    return (
      <PeopleCell
        row={row}
        column={column}
        canEdit={canEdit && !!onAssign}
        roster={roster}
        onAssign={onAssign}
      />
    );
  }

  if (column.kind === "status") {
    return <StatusCell row={row} column={column} canEdit={canEdit} onCommit={commit} />;
  }

  if (column.kind === "select") {
    return <SelectCell row={row} column={column} canEdit={canEdit} onCommit={commit} />;
  }

  return <TextCell row={row} column={column} canEdit={canEdit} onCommit={commit} />;
}

/**
 * Monday's signature: the status cell is the colour, edge to edge, and
 * clicking it opens the palette. The text colour comes from the binding so
 * it meets AA on whichever background the value carries.
 */
function StatusCell({
  row,
  column,
  canEdit,
  onCommit,
}: {
  row: BoardRow;
  column: BoardColumn;
  canEdit: boolean;
  onCommit: (value: BoardCellValue) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useDismiss<HTMLTableCellElement>(() => setOpen(false));
  const raw = row.cells[column.key];
  const value = raw === null || raw === undefined ? "" : String(raw);
  const text = displayValue(column, value);
  const background = value ? column.colorFor?.(value) ?? "var(--friday-surface-3)" : "transparent";
  const color = value ? column.onColorFor?.(value) ?? "var(--friday-bg)" : "var(--friday-fg-subtle)";

  return (
    <td ref={ref} className="relative border-b border-l border-friday-border-soft p-0">
      <button
        type="button"
        disabled={!canEdit}
        onClick={() => canEdit && setOpen((o) => !o)}
        aria-label={`${column.label} of ${row.title}: ${text || "not set"}`}
        aria-haspopup={canEdit ? "menu" : undefined}
        aria-expanded={canEdit ? open : undefined}
        className={cn(
          "flex w-full items-center justify-center px-2 text-[11.5px] font-semibold",
          canEdit && "cursor-pointer",
          !value && "text-friday-fg-subtle",
        )}
        style={{ height: ROW_H, background, color }}
      >
        <span className="truncate">{text || "—"}</span>
      </button>

      {open && (
        <div
          role="menu"
          aria-label={`Set ${column.label}`}
          className="absolute left-0 top-full z-40 mt-1 w-44 overflow-hidden rounded-md border border-friday-border bg-friday-bg p-1 shadow-lg"
        >
          {(column.options ?? []).map((option) => (
            <button
              key={option}
              type="button"
              role="menuitem"
              onClick={() => {
                onCommit(option);
                setOpen(false);
              }}
              className="mb-0.5 flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-[11.5px] font-semibold last:mb-0"
              style={{
                background: column.colorFor?.(option) ?? "var(--friday-surface-3)",
                color: column.onColorFor?.(option) ?? "var(--friday-bg)",
              }}
            >
              <span className="truncate">{displayValue(column, option)}</span>
              {option === value && <Check className="h-3 w-3 shrink-0" />}
            </button>
          ))}
        </div>
      )}
    </td>
  );
}

function SelectCell({
  row,
  column,
  canEdit,
  onCommit,
}: {
  row: BoardRow;
  column: BoardColumn;
  canEdit: boolean;
  onCommit: (value: BoardCellValue) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useDismiss<HTMLTableCellElement>(() => setOpen(false));
  const value = String(row.cells[column.key] ?? "");
  const text = displayValue(column, value);

  return (
    <td ref={ref} className="relative border-b border-l border-friday-border-soft p-0">
      <button
        type="button"
        disabled={!canEdit}
        onClick={() => canEdit && setOpen((o) => !o)}
        aria-label={`${column.label} of ${row.title}: ${text || "not set"}`}
        aria-haspopup={canEdit ? "menu" : undefined}
        aria-expanded={canEdit ? open : undefined}
        className={cn(
          "flex w-full items-center px-3 text-left text-[12.5px] text-friday-fg",
          !value && "text-friday-fg-subtle",
        )}
        style={{ height: ROW_H }}
      >
        <span className="truncate">{text || "—"}</span>
      </button>

      {open && (
        <div
          role="menu"
          aria-label={`Set ${column.label}`}
          className="absolute left-0 top-full z-40 mt-1 w-48 overflow-hidden rounded-md border border-friday-border bg-friday-bg py-1 shadow-lg"
        >
          {(column.options ?? []).map((option) => (
            <button
              key={option}
              type="button"
              role="menuitem"
              onClick={() => {
                onCommit(option);
                setOpen(false);
              }}
              className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-[12.5px] text-friday-fg transition-colors hover:bg-friday-surface-2"
            >
              <span className="truncate">{displayValue(column, option)}</span>
              {option === value && <Check className="h-3 w-3 shrink-0 text-friday-accent" />}
            </button>
          ))}
        </div>
      )}
    </td>
  );
}

/**
 * Text, long text and numbers. Click or press Enter to edit; Enter commits,
 * Escape reverts, Tab commits and moves on, and leaving the cell commits —
 * the spreadsheet contract people already have in their fingers.
 */
function TextCell({
  row,
  column,
  canEdit,
  onCommit,
}: {
  row: BoardRow;
  column: BoardColumn;
  canEdit: boolean;
  onCommit: (value: BoardCellValue) => void;
}) {
  const stored = row.cells[column.key];
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  const start = () => {
    if (!canEdit) return;
    setDraft(stored === null || stored === undefined ? "" : String(stored));
    setEditing(true);
  };

  const finish = (save: boolean) => {
    setEditing(false);
    if (save) onCommit(draft.trim() === "" ? null : draft);
  };

  if (editing) {
    return (
      <td className="relative border-b border-l border-friday-border-soft p-0">
        <CellEditor
          kind={column.kind}
          label={`${column.label} of ${row.title}`}
          value={draft}
          onChange={setDraft}
          onFinish={finish}
        />
      </td>
    );
  }

  const text = displayValue(column, stored ?? null);
  return (
    <td className="border-b border-l border-friday-border-soft p-0">
      <button
        type="button"
        disabled={!canEdit}
        onClick={start}
        aria-label={`${column.label} of ${row.title}: ${text || "empty"}`}
        className={cn(
          "flex w-full items-center px-3 text-left text-[12.5px]",
          column.kind === "number" && "justify-end tabular-nums",
          text ? "text-friday-fg" : "text-friday-fg-subtle",
          canEdit && "hover:bg-friday-surface-2",
        )}
        style={{ height: ROW_H }}
      >
        <span className="truncate">{text || (canEdit ? "" : "—")}</span>
      </button>
    </td>
  );
}

/**
 * The input a cell turns into.
 *
 * Its own component so focus can move into it on mount through a ref: an
 * autoFocus attribute does the same job, but the accessibility lint rightly
 * objects to that attribute in general and this is the narrower mechanism.
 * The existing text is selected, so typing replaces the value while the
 * arrow keys still get you into it — the spreadsheet behaviour people expect.
 */
function CellEditor({
  kind,
  label,
  value,
  onChange,
  onFinish,
}: {
  kind: BoardColumnKind;
  label: string;
  value: string;
  onChange: (value: string) => void;
  onFinish: (save: boolean) => void;
}) {
  const ref = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    node.focus();
    node.setSelectionRange(0, node.value.length);
  }, []);

  const shared = {
    value,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      onChange(e.target.value),
    onBlur: () => onFinish(true),
    "aria-label": label,
  };

  if (kind === "longtext") {
    return (
      <textarea
        {...shared}
        ref={(node) => { ref.current = node; }}
        rows={4}
        onKeyDown={(e) => {
          if (e.key === "Escape") onFinish(false);
          // Enter breaks the line in long text; Cmd/Ctrl+Enter commits.
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) onFinish(true);
        }}
        className="absolute left-0 top-0 z-30 w-70 resize-none rounded-md border border-friday-accent bg-friday-bg px-3 py-2 text-[12.5px] text-friday-fg shadow-lg outline-none"
      />
    );
  }

  return (
    <input
      {...shared}
      ref={(node) => { ref.current = node; }}
      inputMode={kind === "number" ? "numeric" : undefined}
      onKeyDown={(e) => {
        if (e.key === "Escape") onFinish(false);
        if (e.key === "Enter") onFinish(true);
      }}
      className="w-full border border-friday-accent bg-friday-bg px-3 text-[12.5px] text-friday-fg outline-none"
      style={{ height: ROW_H }}
    />
  );
}

function PeopleCell({
  row,
  column,
  canEdit,
  roster,
  onAssign,
}: {
  row: BoardRow;
  column: BoardColumn;
  canEdit: boolean;
  roster: readonly BoardPerson[];
  onAssign?: BoardProps["onAssign"];
}) {
  const [open, setOpen] = useState(false);
  const ref = useDismiss<HTMLTableCellElement>(() => setOpen(false));
  const assigned = new Set(row.people.map((p) => p.id));
  const names = row.people.map((p) => p.name ?? "unnamed").join(", ");

  return (
    <td ref={ref} className="relative border-b border-l border-friday-border-soft p-0">
      <button
        type="button"
        disabled={!canEdit}
        onClick={() => canEdit && setOpen((o) => !o)}
        aria-label={
          row.people.length > 0
            ? `${column.label} of ${row.title}: ${names}`
            : `${column.label} of ${row.title}: nobody assigned`
        }
        aria-haspopup={canEdit ? "menu" : undefined}
        aria-expanded={canEdit ? open : undefined}
        className={cn("flex w-full items-center px-3", canEdit && "hover:bg-friday-surface-2")}
        style={{ height: ROW_H }}
      >
        {row.people.length === 0 ? (
          <span className="text-[12.5px] text-friday-fg-subtle">—</span>
        ) : (
          <span aria-hidden className="flex items-center">
            {row.people.slice(0, 4).map((person, i) => (
              <Avatar
                key={person.id}
                className={cn("h-5.5 w-5.5 border border-friday-bg text-[9px]", i > 0 && "-ml-1.5")}
              >
                {person.image && <AvatarImage src={person.image} alt="" />}
                <AvatarFallback className="bg-friday-surface-3 text-[9px] text-friday-fg">
                  {personInitials(person)}
                </AvatarFallback>
              </Avatar>
            ))}
            {row.people.length > 4 && (
              <span className="-ml-1.5 flex h-5.5 w-5.5 items-center justify-center rounded-full border border-friday-bg bg-friday-surface-3 text-[9px] text-friday-fg">
                +{row.people.length - 4}
              </span>
            )}
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          aria-label={`Assign to ${row.title}`}
          className="absolute left-0 top-full z-40 mt-1 max-h-64 w-60 overflow-y-auto rounded-md border border-friday-border bg-friday-bg py-1 shadow-lg"
        >
          {roster.length === 0 ? (
            <p className="px-3 py-2 text-[11.5px] text-friday-fg-subtle">No one to assign</p>
          ) : (
            roster.map((person) => {
              const isOn = assigned.has(person.id);
              return (
                <button
                  key={person.id}
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked={isOn}
                  onClick={() => void onAssign?.(row.id, person.id, isOn ? "remove" : "add")}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors hover:bg-friday-surface-2"
                >
                  <Avatar className="h-5 w-5 text-[9px]">
                    {person.image && <AvatarImage src={person.image} alt="" />}
                    <AvatarFallback className="bg-friday-surface-3 text-[9px] text-friday-fg">
                      {personInitials(person)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="flex-1 truncate text-[12.5px] text-friday-fg">
                    {person.name ?? "Unnamed"}
                  </span>
                  {isOn && <Check className="h-3 w-3 shrink-0 text-friday-accent" />}
                </button>
              );
            })
          )}
        </div>
      )}
    </td>
  );
}

// ── Add row, summary, bulk bar ───────────────────────────────────────────────

function AddRow({
  color,
  itemNoun,
  groupLabel,
  columnCount,
  onAdd,
}: {
  color: string;
  itemNoun: string;
  groupLabel: string;
  columnCount: number;
  onAdd: (title: string) => void | Promise<void>;
}) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const title = value.trim();
    if (!title || busy) return;
    setBusy(true);
    try {
      await onAdd(title);
      setValue("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <tr style={{ height: ROW_H }}>
      <td colSpan={columnCount} className="border-b border-friday-border-soft bg-friday-bg p-0">
        <span className="flex items-center" style={{ height: ROW_H }}>
          <span aria-hidden style={{ width: CHECK_W }} />
          <span aria-hidden className="h-full w-0.75 shrink-0" style={{ background: color }} />
          <Plus className="mx-2 h-3.5 w-3.5 shrink-0 text-friday-fg-subtle" />
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
            className="h-full flex-1 bg-transparent pr-3 text-[12.5px] text-friday-fg outline-none placeholder:text-friday-fg-subtle"
          />
        </span>
      </td>
    </tr>
  );
}

function SummaryRow({
  columns,
  rows,
}: {
  columns: readonly BoardColumn[];
  rows: readonly BoardRow[];
}) {
  if (rows.length === 0) return null;
  return (
    <tr>
      <td />
      <td />
      {columns.map((column) => {
        if (column.kind === "status") {
          const segments = statusDistribution(rows, column);
          const legend = segments.map((s) => `${s.label} ${s.count}`).join(", ");
          return (
            <td key={column.key} className="px-2 py-1.5 align-middle">
              <span aria-hidden className="flex h-2 overflow-hidden rounded-full">
                {segments.map((segment) => (
                  <span
                    key={segment.value}
                    style={{ width: `${segment.percent}%`, background: segment.color }}
                  />
                ))}
              </span>
              <span className="sr-only">
                {column.label}: {legend}
              </span>
            </td>
          );
        }
        const summary = columnSummary(rows, column);
        return (
          <td
            key={column.key}
            className={cn(
              "px-3 py-1.5 text-[10.5px] text-friday-fg-subtle",
              column.kind === "number" && "text-right tabular-nums",
            )}
          >
            {summary}
          </td>
        );
      })}
      <td />
    </tr>
  );
}

function BulkBar({
  count,
  itemNoun,
  actions,
  ids,
  onClear,
}: {
  count: number;
  itemNoun: string;
  actions: readonly BulkAction[];
  ids: string[];
  onClear: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const ref = useDismiss<HTMLDivElement>(() => setOpenMenu(null));

  const run = async (fn: () => void | Promise<void>) => {
    setBusy(true);
    try {
      await fn();
      setOpenMenu(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      ref={ref}
      role="region"
      aria-label={`${selectionLabel(count, itemNoun)}, bulk actions`}
      className="absolute bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-1 rounded-lg border border-friday-border bg-friday-bg px-2 py-1.5 shadow-xl"
    >
      <span className="px-2 text-[12px] font-medium text-friday-fg">
        {selectionLabel(count, itemNoun)}
      </span>

      {actions.map((action) => (
        <div key={action.label} className="relative">
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              action.options
                ? setOpenMenu((m) => (m === action.label ? null : action.label))
                : void run(() => action.run(ids))
            }
            aria-haspopup={action.options ? "menu" : undefined}
            aria-expanded={action.options ? openMenu === action.label : undefined}
            className={cn(
              "rounded px-2.5 py-1.5 text-[12px] transition-colors disabled:opacity-50",
              action.tone === "danger"
                ? "text-friday-error-fg hover:bg-friday-error-bg"
                : "text-friday-fg hover:bg-friday-surface-2",
            )}
          >
            {action.label}
          </button>

          {action.options && openMenu === action.label && (
            <div
              role="menu"
              aria-label={action.label}
              className="absolute bottom-full left-0 mb-1 w-44 overflow-hidden rounded-md border border-friday-border bg-friday-bg p-1 shadow-lg"
            >
              {action.options.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="menuitem"
                  disabled={busy}
                  onClick={() => void run(() => action.runOption?.(ids, option.value))}
                  className="mb-0.5 flex w-full items-center rounded px-2 py-1.5 text-left text-[11.5px] font-semibold last:mb-0 disabled:opacity-50"
                  style={
                    option.color
                      ? { background: option.color, color: "var(--friday-bg)" }
                      : undefined
                  }
                >
                  <span className="truncate">{option.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      ))}

      <button
        type="button"
        onClick={onClear}
        aria-label="Clear selection"
        className="ml-1 rounded p-1.5 text-friday-fg-subtle transition-colors hover:bg-friday-surface-2 hover:text-friday-fg"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// ── Bits ─────────────────────────────────────────────────────────────────────

/**
 * A tri-state checkbox. Native input so it is keyboard- and
 * screen-reader-correct for free; `indeterminate` is a DOM property with no
 * attribute, so it is set through the ref.
 */
function Checkbox({
  state,
  label,
  onChange,
}: {
  state: "none" | "some" | "all";
  label: string;
  onChange: (shiftKey: boolean) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = state === "some";
  }, [state]);

  return (
    <input
      ref={ref}
      type="checkbox"
      checked={state === "all"}
      aria-label={label}
      onChange={() => undefined}
      onClick={(e) => onChange(e.shiftKey)}
      className="h-3.5 w-3.5 shrink-0 cursor-pointer accent-friday-accent"
    />
  );
}

