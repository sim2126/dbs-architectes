/**
 * A saved view: someone's arrangement of a board, under a name.
 *
 * "My sites in Valais", "Everything stuck", "Pipeline". At twenty projects
 * you find what you want by looking; at two hundred you find it by having
 * asked for it once and named the answer.
 *
 * The state is stored as JSON and comes back as `unknown`, so this module
 * owns both halves: the shape, and a parser that will not let a malformed
 * or hostile row reach the board. Anything unrecognised is dropped rather
 * than trusted — a saved view is a convenience, and one bad row must not
 * take the board down with it.
 */

import type { BoardColumn } from "./columns";
import {
  EMPTY_VIEW,
  MAX_COLUMN_WIDTH,
  MIN_COLUMN_WIDTH,
  type BoardView,
} from "./view-state";

export type BoardLayout = "table" | "kanban" | "calendar";

export type SavedViewState = {
  view: BoardView;
  layout: BoardLayout;
  /** Key of the column the rows are grouped by. */
  groupBy: string;
};

export type SavedView = {
  id: string;
  name: string;
  state: SavedViewState;
};

export const MAX_VIEW_NAME = 60;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

function parseValues(value: unknown): Record<string, readonly string[]> {
  if (!isRecord(value)) return {};
  const out: Record<string, readonly string[]> = {};
  for (const [key, raw] of Object.entries(value)) {
    const list = stringArray(raw);
    if (list.length > 0) out[key] = list;
  }
  return out;
}

function parseWidths(value: unknown): Record<string, number> {
  if (!isRecord(value)) return {};
  const out: Record<string, number> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (typeof raw !== "number" || !Number.isFinite(raw)) continue;
    out[key] = Math.max(MIN_COLUMN_WIDTH, Math.min(MAX_COLUMN_WIDTH, Math.round(raw)));
  }
  return out;
}

function parseSort(value: unknown): BoardView["sort"] {
  if (!isRecord(value)) return null;
  const key = value.key;
  const direction = value.direction;
  if (typeof key !== "string" || (direction !== "asc" && direction !== "desc")) return null;
  return { key, direction };
}

/** Validate one stored view. Returns null when there is nothing usable in it. */
export function parseSavedViewState(input: unknown, fallbackGroupBy: string): SavedViewState | null {
  if (!isRecord(input)) return null;
  const rawView = isRecord(input.view) ? input.view : null;
  if (!rawView) return null;

  const view: BoardView = {
    ...EMPTY_VIEW,
    values: parseValues(rawView.values),
    people: stringArray(rawView.people),
    sort: parseSort(rawView.sort),
    hidden: stringArray(rawView.hidden),
    widths: parseWidths(rawView.widths),
    order: stringArray(rawView.order),
  };

  return {
    view,
    layout:
      input.layout === "kanban" || input.layout === "calendar" ? input.layout : "table",
    groupBy: typeof input.groupBy === "string" && input.groupBy ? input.groupBy : fallbackGroupBy,
  };
}

/** Trim and bound a name typed by a person. Empty means "do not save". */
export function normaliseViewName(raw: string): string {
  return raw.trim().replace(/\s+/g, " ").slice(0, MAX_VIEW_NAME);
}

/**
 * A short description of what a view actually does, for the menu — so a name
 * someone chose badly in a hurry is still identifiable a month later.
 */
export function describeView(state: SavedViewState, columns: readonly BoardColumn[]): string {
  const label = (key: string) => columns.find((c) => c.key === key)?.label ?? key;
  const parts: string[] = [
    state.layout === "kanban" ? "Kanban" : state.layout === "calendar" ? "Calendar" : "Table",
  ];

  const filters = Object.keys(state.view.values).length + (state.view.people.length > 0 ? 1 : 0);
  if (filters > 0) parts.push(`${filters} filter${filters === 1 ? "" : "s"}`);
  if (state.view.sort) parts.push(`sorted by ${label(state.view.sort.key)}`);
  if (state.view.hidden.length > 0) parts.push(`${state.view.hidden.length} hidden`);
  parts.push(`grouped by ${label(state.groupBy)}`);

  return parts.join(" · ");
}
