/**
 * What the viewer has done to the board without changing any data.
 *
 * Monday's toolbar carries Person, Filter, Sort and Hide. All four are the
 * same idea: the rows and columns on screen are a view over the board, held
 * per person and per session, and nothing here writes anything.
 *
 * Pure, so the rules that are easy to get subtly wrong — where empty values
 * sort, what order a status column sorts in, whether a filter with nothing
 * chosen constrains anything — are settled here and tested.
 */

import type { BoardColumn, BoardRow } from "./columns";

export type BoardSort = { key: string; direction: "asc" | "desc" } | null;

export type BoardView = {
  /**
   * Column key to the values allowed through. A key with an empty list is
   * no constraint at all, which is what an opened-and-closed filter menu
   * leaves behind.
   */
  values: Record<string, readonly string[]>;
  /** Row must have at least one of these people. Empty means everyone. */
  people: readonly string[];
  sort: BoardSort;
  /** Column keys the viewer has put away. */
  hidden: readonly string[];
};

export const EMPTY_VIEW: BoardView = { values: {}, people: [], sort: null, hidden: [] };

// ── Reading the view ─────────────────────────────────────────────────────────

/** How many constraints are active. Drives the "Filter (2)" label. */
export function activeFilterCount(view: BoardView): number {
  const byValue = Object.values(view.values).filter((list) => list.length > 0).length;
  return byValue + (view.people.length > 0 ? 1 : 0);
}

export function isFiltered(view: BoardView): boolean {
  return activeFilterCount(view) > 0;
}

export function isHidden(view: BoardView, key: string): boolean {
  return view.hidden.includes(key);
}

export function selectedValues(view: BoardView, key: string): readonly string[] {
  return view.values[key] ?? [];
}

// ── Changing the view ────────────────────────────────────────────────────────

export function toggleFilterValue(view: BoardView, key: string, value: string): BoardView {
  const current = view.values[key] ?? [];
  const next = current.includes(value)
    ? current.filter((v) => v !== value)
    : [...current, value];
  const values = { ...view.values };
  // Drop the key entirely when nothing is chosen, so activeFilterCount and
  // equality checks do not have to know about empty lists.
  if (next.length === 0) delete values[key];
  else values[key] = next;
  return { ...view, values };
}

export function togglePerson(view: BoardView, userId: string): BoardView {
  const people = view.people.includes(userId)
    ? view.people.filter((id) => id !== userId)
    : [...view.people, userId];
  return { ...view, people };
}

export function toggleHidden(view: BoardView, key: string): BoardView {
  const hidden = view.hidden.includes(key)
    ? view.hidden.filter((k) => k !== key)
    : [...view.hidden, key];
  return { ...view, hidden };
}

/** Ascending, then descending, then off — one click at a time on a header. */
export function cycleSort(view: BoardView, key: string): BoardView {
  if (view.sort?.key !== key) return { ...view, sort: { key, direction: "asc" } };
  if (view.sort.direction === "asc") return { ...view, sort: { key, direction: "desc" } };
  return { ...view, sort: null };
}

export function clearFilters(view: BoardView): BoardView {
  return { ...view, values: {}, people: [] };
}

// ── Applying the view ────────────────────────────────────────────────────────

function cellText(row: BoardRow, key: string): string {
  const value = row.cells[key];
  return value === null || value === undefined ? "" : String(value);
}

function matches(row: BoardRow, view: BoardView): boolean {
  for (const [key, allowed] of Object.entries(view.values)) {
    if (allowed.length === 0) continue;
    if (!allowed.includes(cellText(row, key))) return false;
  }
  if (view.people.length > 0) {
    const ids = new Set(row.people.map((p) => p.id));
    if (!view.people.some((id) => ids.has(id))) return false;
  }
  return true;
}

/**
 * Compare two rows on one column.
 *
 * Three rules worth stating. A status or select column sorts in the order its
 * options are declared, not alphabetically — "Not Started, Working on it,
 * Stuck, Done" is the meaningful order and A-to-Z is noise. Numbers compare
 * numerically. Empty always sorts last, in both directions, because a
 * missing value is not smaller than a present one, it is absent.
 */
function compare(a: BoardRow, b: BoardRow, column: BoardColumn): number {
  if (column.kind === "people") {
    return b.people.length - a.people.length;
  }

  const left = cellText(a, column.key);
  const right = cellText(b, column.key);
  if (left === "" && right === "") return 0;
  if (left === "") return 1;
  if (right === "") return -1;

  if (column.kind === "status" || column.kind === "select") {
    const options = column.options ?? [];
    const li = options.indexOf(left);
    const ri = options.indexOf(right);
    // A value outside the declared options sorts after the ones inside it.
    return (li === -1 ? options.length : li) - (ri === -1 ? options.length : ri);
  }

  if (column.kind === "number") {
    const ln = Number(left);
    const rn = Number(right);
    if (Number.isFinite(ln) && Number.isFinite(rn)) return ln - rn;
  }

  return left.localeCompare(right, undefined, { sensitivity: "base" });
}

/**
 * The rows and columns actually on screen.
 *
 * Sorting is stable and applies within the whole list; because grouping
 * afterwards preserves the order it is handed, the effect is Monday's — rows
 * sorted inside each group.
 */
export function applyView(
  rows: readonly BoardRow[],
  columns: readonly BoardColumn[],
  view: BoardView,
): { rows: BoardRow[]; columns: BoardColumn[] } {
  const visibleColumns = columns.filter((column) => !view.hidden.includes(column.key));
  const kept = rows.filter((row) => matches(row, view));

  const sort = view.sort;
  if (sort) {
    const column = columns.find((c) => c.key === sort.key);
    if (column) {
      const direction = sort.direction === "asc" ? 1 : -1;
      // Empty values stay last whichever way the column is sorted, so the
      // direction is applied to the comparison and not to the blanks.
      kept.sort((a, b) => {
        const left = cellText(a, column.key);
        const right = cellText(b, column.key);
        if (column.kind !== "people") {
          if (left === "" && right !== "") return 1;
          if (right === "" && left !== "") return -1;
        }
        return compare(a, b, column) * direction;
      });
    }
  }

  return { rows: kept, columns: visibleColumns };
}
