/**
 * Grouping and group summaries.
 *
 * Monday's board is groups first: every row sits in exactly one group, the
 * group carries a colour and a count, and its footer summarises each column.
 * Grouping by a column's value is the whole rule, so it is a pure function
 * of the rows and the column that groups them.
 */

import type { BoardCellValue, BoardColumn, BoardRow } from "./columns";
import { formatDay, parseDayValue } from "./calendar-layout";

export type BoardGroup = {
  /** The grouping column's value. `null` for rows with none. */
  value: string | null;
  label: string;
  /** Group accent, shown as the left bar and the header text colour. */
  color: string;
  rows: BoardRow[];
};

/**
 * Split rows into groups, in the order the grouping column declares.
 *
 * Every declared option gets a group even when empty: Monday shows the empty
 * group so a row can be dragged into it, and a phase with no projects is
 * information rather than absence. Rows whose value is outside the options
 * are collected last under "Ungrouped" rather than dropped — silently losing
 * a row from a board people work in is the worst possible failure.
 */
export function groupRows(
  rows: readonly BoardRow[],
  groupBy: BoardColumn,
): BoardGroup[] {
  const options = groupBy.options ?? [];
  const byValue = new Map<string, BoardRow[]>();
  const ungrouped: BoardRow[] = [];

  for (const row of rows) {
    const raw = row.cells[groupBy.key];
    const value = raw === null || raw === undefined || raw === "" ? null : String(raw);
    if (value !== null && options.includes(value)) {
      const bucket = byValue.get(value);
      if (bucket) bucket.push(row);
      else byValue.set(value, [row]);
    } else {
      ungrouped.push(row);
    }
  }

  const groups: BoardGroup[] = options.map((value) => ({
    value,
    label: groupBy.labelFor ? groupBy.labelFor(value) : value,
    color: groupBy.colorFor?.(value) ?? "var(--friday-fg-subtle)",
    rows: byValue.get(value) ?? [],
  }));

  if (ungrouped.length > 0) {
    groups.push({
      value: null,
      label: "Ungrouped",
      color: "var(--friday-fg-subtle)",
      rows: ungrouped,
    });
  }

  return groups;
}

export type SummarySegment = {
  value: string;
  label: string;
  color: string;
  count: number;
  /** Share of the group, 0–100, rounded so the segments still total 100. */
  percent: number;
};

/**
 * The distribution bar under a status column — Monday calls it the battery.
 *
 * Percentages are rounded so they sum to exactly 100, otherwise a three-way
 * split renders a one-pixel gap that reads as a rendering bug.
 */
export function statusDistribution(
  rows: readonly BoardRow[],
  column: BoardColumn,
): SummarySegment[] {
  const total = rows.length;
  if (total === 0) return [];

  const counts = new Map<string, number>();
  for (const row of rows) {
    const raw = row.cells[column.key];
    const value = raw === null || raw === undefined || raw === "" ? "" : String(raw);
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  const order = [...(column.options ?? [])];
  for (const value of counts.keys()) if (!order.includes(value)) order.push(value);

  const present = order.filter((value) => (counts.get(value) ?? 0) > 0);
  const segments = present.map((value) => {
    const count = counts.get(value) ?? 0;
    return {
      value,
      label: value === "" ? "Not set" : column.labelFor ? column.labelFor(value) : value,
      color: value === "" ? "var(--friday-surface-3)" : column.colorFor?.(value) ?? "var(--friday-surface-3)",
      count,
      percent: Math.floor((count / total) * 100),
    };
  });

  // Hand the rounding remainder to the largest segment.
  const assigned = segments.reduce((sum, s) => sum + s.percent, 0);
  if (segments.length > 0 && assigned < 100) {
    let largest = 0;
    for (let i = 1; i < segments.length; i++) {
      if (segments[i].count > segments[largest].count) largest = i;
    }
    segments[largest] = { ...segments[largest], percent: segments[largest].percent + (100 - assigned) };
  }

  return segments;
}

/**
 * The one-line summary a group footer shows for a non-status column:
 * how many rows carry a value, or the total for a number column.
 */
export function columnSummary(
  rows: readonly BoardRow[],
  column: BoardColumn,
): string {
  if (rows.length === 0) return "";

  const values: BoardCellValue[] = rows.map((row) => row.cells[column.key] ?? null);
  const filled = values.filter((v) => v !== null && v !== undefined && v !== "");

  if (column.kind === "number") {
    const numbers = filled.map(Number).filter((n) => Number.isFinite(n));
    if (numbers.length === 0) return "";
    const sum = numbers.reduce((a, b) => a + b, 0);
    // A year column summed is nonsense, so report the span instead of a total
    // whenever every value looks like a calendar year.
    const looksLikeYears = numbers.every((n) => n >= 1900 && n <= 2200);
    if (looksLikeYears) {
      const min = Math.min(...numbers);
      const max = Math.max(...numbers);
      return min === max ? String(min) : `${min}–${max}`;
    }
    return String(sum);
  }

  if (column.kind === "date") {
    const days = filled
      .map((value) => parseDayValue(value))
      .filter((day): day is Date => day !== null)
      .sort((a, b) => a.getTime() - b.getTime());
    if (days.length === 0) return "";
    const first = formatDay(days[0]);
    const last = formatDay(days[days.length - 1]);
    return first === last ? first : `${first} – ${last}`;
  }

  if (column.kind === "people") {
    const withPeople = rows.filter((row) => row.people.length > 0).length;
    return withPeople === rows.length ? "All staffed" : `${withPeople}/${rows.length} staffed`;
  }

  if (filled.length === 0) return "Empty";
  if (filled.length === rows.length) return "";
  return `${rows.length - filled.length} empty`;
}
