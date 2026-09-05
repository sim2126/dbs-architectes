/**
 * The editable column contract for the Projects table.
 *
 * This exists to replace the Sheets surface. Sheets is a spreadsheet
 * pretending to be a product: an infinite grid with no notion of what a
 * project is, which is why it silently dropped four fields until commit
 * 26ed62a. Defining the columns as data means the editor, the save payload
 * and the validation all read from one place and cannot drift apart.
 *
 * Pure. No React, no Prisma — importable by a test, a server action or a
 * cell renderer alike.
 */

import { CATEGORIES, PHASES } from "@/ui/utils";

export type ColumnKind = "text" | "select" | "number" | "longtext";

export type EditableColumn = {
  /** Must match the Project field name exactly — it is the save payload key. */
  field: string;
  label: string;
  kind: ColumnKind;
  /** Present only for `select`. */
  options?: readonly string[];
  /** Column width in the table. */
  width: number;
  /** Whether an empty value is acceptable. */
  required?: boolean;
};

/** Work status is a locked four-value palette shared with the board. */
export const WORK_STATUSES = ["todo", "doing", "stuck", "completed"] as const;

/**
 * The columns Sheets exposed, as a typed contract.
 *
 * Order is the on-screen order. `title` first because it is the row's
 * identity; `notes` last because it is the only free-form field and would
 * otherwise push the structured columns off-screen.
 */
export const PROJECT_COLUMNS: readonly EditableColumn[] = [
  { field: "title", label: "Project", kind: "text", width: 280, required: true },
  { field: "phase", label: "Phase", kind: "select", options: PHASES, width: 140 },
  {
    field: "workStatus",
    label: "Status",
    kind: "select",
    options: WORK_STATUSES,
    width: 130,
  },
  { field: "category", label: "Category", kind: "select", options: CATEGORIES, width: 150 },
  { field: "client", label: "Client", kind: "text", width: 180 },
  { field: "commune", label: "Commune", kind: "text", width: 150 },
  { field: "year", label: "Year", kind: "number", width: 90 },
  { field: "billing", label: "Billing", kind: "text", width: 120 },
  { field: "notes", label: "Notes", kind: "longtext", width: 240 },
];

export type ProjectFieldValue = string | number | null;

export type ValidationResult =
  | { ok: true; value: ProjectFieldValue }
  | { ok: false; reason: string };

/**
 * Validates and normalises one cell edit.
 *
 * Returns the value to persist rather than a boolean, so callers cannot
 * accidentally save the raw input after a successful check.
 */
export function validateCell(
  column: EditableColumn,
  raw: string,
): ValidationResult {
  const trimmed = raw.trim();

  if (trimmed === "") {
    if (column.required) {
      return { ok: false, reason: `${column.label} cannot be empty.` };
    }
    // Empty clears the field. Null rather than "" so the column is genuinely
    // absent instead of holding a blank string that sorts before everything.
    return { ok: true, value: null };
  }

  if (column.kind === "number") {
    const n = Number(trimmed);
    if (!Number.isFinite(n) || !Number.isInteger(n)) {
      return { ok: false, reason: `${column.label} must be a whole number.` };
    }
    // Years are the only numeric column today. A four-digit bound catches
    // the common typo (202 or 20255) without inventing a business rule.
    if (n < 1900 || n > 2200) {
      return { ok: false, reason: `${column.label} looks wrong.` };
    }
    return { ok: true, value: n };
  }

  if (column.kind === "select") {
    if (!column.options?.includes(trimmed)) {
      return { ok: false, reason: `"${trimmed}" is not a valid ${column.label}.` };
    }
    return { ok: true, value: trimmed };
  }

  return { ok: true, value: trimmed };
}

/** Look up a column by field name. */
export function columnFor(field: string): EditableColumn | undefined {
  return PROJECT_COLUMNS.find((c) => c.field === field);
}

/**
 * Builds the save payload for a single-cell edit.
 *
 * Deliberately narrow: one field per call. The Sheets bug was a payload
 * that named a subset of the fields the editor exposed, so nothing here
 * ever assembles a partial object from a wider form.
 */
export function buildCellPayload(
  field: string,
  raw: string,
): { ok: true; payload: Record<string, ProjectFieldValue> } | { ok: false; reason: string } {
  const column = columnFor(field);
  if (!column) return { ok: false, reason: `Unknown column: ${field}` };

  const result = validateCell(column, raw);
  if (!result.ok) return { ok: false, reason: result.reason };

  return { ok: true, payload: { [field]: result.value } };
}
