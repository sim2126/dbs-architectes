import { buildCellPayload, WORK_STATUSES } from "./editable-columns";

export class ProjectInputError extends Error {
  constructor(message: string, readonly status: 400 | 404 | 409 = 400) {
    super(message);
    this.name = "ProjectInputError";
  }
}

export function requireProjectObject(value: unknown): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ProjectInputError("Project changes must be a JSON object.");
  }
}

export function validateProjectValues(data: object, creating = false): void {
  requireProjectObject(data);
  for (const field of ["code", "title", "phase", "category", "workStatus"]) {
    const value = data[field];
    if (value !== undefined && (typeof value !== "string" || !value.trim())) {
      throw new ProjectInputError(`${field} must be a non-empty string.`);
    }
  }
  if (creating && data.title === undefined) throw new ProjectInputError("Project title is required.");
  for (const field of ["client", "commune", "typology", "terrain", "roof", "description", "notes",
    "billing", "image", "pageLink", "country", "operatingRegion", "regionCode", "address"]) {
    const value = data[field];
    if (value !== undefined && value !== null && typeof value !== "string") {
      throw new ProjectInputError(`${field} must be text or null.`);
    }
  }
  if (data.workStatus !== undefined && !(WORK_STATUSES as readonly unknown[]).includes(data.workStatus)) {
    throw new ProjectInputError("Work status must be todo, doing, stuck or completed.");
  }
}

export function parseProjectCoordinate(value: unknown, field: "latitude" | "longitude"): number | null {
  if (value === null || value === "") return null;
  if ((typeof value !== "number" && typeof value !== "string") || !String(value).trim()) {
    throw new ProjectInputError(`${field} must be a valid coordinate.`);
  }
  const coordinate = Number(value);
  const bound = field === "latitude" ? 90 : 180;
  if (!Number.isFinite(coordinate) || Math.abs(coordinate) > bound) {
    throw new ProjectInputError(`${field} must be a valid coordinate.`);
  }
  return coordinate;
}

/** Accept date-only cells and canonical UTC timestamps without JS rollover. */
export function parseProjectDate(value: unknown, label: string): Date | null {
  if (value === null || value === "") return null;
  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime())) throw new ProjectInputError(`${label} must be a valid date.`);
    return new Date(value);
  }
  if (typeof value !== "string" ||
      !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z)?$/.test(value)) {
    throw new ProjectInputError(`${label} must be a date in YYYY-MM-DD format.`);
  }
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value.slice(0, 10)) {
    throw new ProjectInputError(`${label} must be a valid date.`);
  }
  return date;
}

export function validateProjectDateRange(start: Date | null, end: Date | null): void {
  if (start && end && start > end) {
    throw new ProjectInputError("Start date must be on or before end date.");
  }
}

export function parseProjectYear(value: unknown): number | null {
  if (value === null || value === "") return null;
  if (typeof value !== "number" && typeof value !== "string") {
    throw new ProjectInputError("Year must be a whole number.");
  }
  const result = buildCellPayload("year", String(value));
  if (!result.ok) throw new ProjectInputError(result.reason);
  return result.payload.year as number | null;
}
