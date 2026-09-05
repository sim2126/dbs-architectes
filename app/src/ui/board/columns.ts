/**
 * What a board column is.
 *
 * A board is Monday's model: rows carrying typed cells, gathered into groups.
 * The type of a cell decides how it renders, how it is edited, and how a
 * group summarises it — so the type lives here as data rather than as a
 * branch inside a renderer.
 *
 * Pure. No React, no Prisma. The projects board binds these to Project
 * fields; a later topic board will bind the same kinds to its own.
 */

export type BoardColumnKind =
  /** Single-line free text. Edits in place. */
  | "text"
  /** Multi-line free text. Edits in a small popover. */
  | "longtext"
  /** A number. Edits in place, validated by the binding. */
  | "number"
  /** One of a fixed list, painted as a coloured label. Monday's status. */
  | "status"
  /** One of a fixed list, painted as plain text. Monday's dropdown. */
  | "select"
  /** A calendar day. Stored as `yyyy-mm-dd`, edited with a date picker. */
  | "date"
  /** People assigned to the row, as an avatar stack. */
  | "people"
  /** Derived or system-owned. Shown, never edited. */
  | "readonly";

export type BoardColumn = {
  /** Stable key. For a bound board this is the field name it saves to. */
  key: string;
  label: string;
  kind: BoardColumnKind;
  /** Column width in pixels. The board is a fixed-layout grid, like Monday's. */
  width: number;
  /** For `status` and `select`: the permitted values, in display order. */
  options?: readonly string[];
  /**
   * For `status`: the background and text colour of each option's label.
   * Supplied by the binding so the board never knows a token name.
   */
  colorFor?: (value: string) => string;
  onColorFor?: (value: string) => string;
  /** Human label for an option, when the stored value is not presentable. */
  labelFor?: (value: string) => string;
  /** An empty value is refused. */
  required?: boolean;
};

/** A cell value as the board carries it. */
export type BoardCellValue = string | number | null;

export type BoardPerson = {
  id: string;
  name: string | null;
  initials: string | null;
  image?: string | null;
};

export type BoardRow = {
  id: string;
  /** The row's identity in the first, sticky column. */
  title: string;
  /** Short code or subtitle shown under the title. */
  subtitle?: string | null;
  cells: Record<string, BoardCellValue>;
  people: BoardPerson[];
  /** Count shown on the row's conversation button. */
  updateCount?: number;
};

/** Presentable text for a cell, for the read state and for CSV. */
export function displayValue(column: BoardColumn, value: BoardCellValue): string {
  if (value === null || value === undefined || value === "") return "";
  const text = String(value);
  return column.labelFor ? column.labelFor(text) : text;
}

/** Initials for an avatar, falling back to the name and then to a dash. */
export function personInitials(person: BoardPerson): string {
  if (person.initials?.trim()) return person.initials.trim().slice(0, 2).toUpperCase();
  const name = person.name?.trim();
  if (!name) return "—";
  const parts = name.split(/\s+/);
  const letters = parts.length > 1 ? parts[0][0] + parts[1][0] : name.slice(0, 2);
  return letters.toUpperCase();
}

/**
 * Which columns a value can be typed into. Monday greys the rest; so do we,
 * and the board refuses the edit rather than trusting the renderer.
 */
export function isEditable(column: BoardColumn): boolean {
  return column.kind !== "readonly";
}
