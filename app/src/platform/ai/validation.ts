import type { ResolvedContext } from "./grounding";

export type GroundingIssueKind = "user" | "project" | "phase" | "date";
export type GroundingIssueSeverity = "warning" | "error";
export type GroundingIssueAction = "flagged" | "stripped";

export interface GroundingValidationIssue {
  kind: GroundingIssueKind;
  path: string;
  value: string;
  severity: GroundingIssueSeverity;
  action: GroundingIssueAction;
  reason: "not-in-resolved-context";
}

export interface GroundingValidationResult<T> {
  output: T;
  issues: GroundingValidationIssue[];
  valid: boolean;
}

export interface GroundingValidationOptions {
  /** Flag by default; strip high-severity entity fields when explicitly requested. */
  mode?: "flag" | "strip";
}

const STRIPPED = Symbol("grounding-stripped");

interface AllowedGroundingValues {
  users: Set<string>;
  projects: Set<string>;
  projectCodes: Set<string>;
  phases: Set<string>;
  dates: Set<string>;
  explicitlyUnresolved: Set<string>;
}

function normalise(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("en")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function buildAllowedValues(context: ResolvedContext): AllowedGroundingValues {
  const users = new Set<string>();
  for (const user of context.users) {
    for (const value of [user.id, user.name, user.email, ...user.aliases]) {
      users.add(normalise(value));
    }
  }

  const projects = new Set<string>();
  const projectCodes = new Set<string>();
  for (const project of context.projects) {
    for (const value of [project.id, project.code, project.title, ...project.aliases]) {
      projects.add(normalise(value));
    }
    projectCodes.add(normalise(project.code));
  }

  return {
    users,
    projects,
    projectCodes,
    phases: new Set([
      ...context.phases.map((phase) => normalise(phase.value)),
      ...context.projects.map((project) => normalise(project.phase)),
    ]),
    dates: new Set(context.dates.flatMap((date) => [date.source, date.isoDate]).map(normalise)),
    explicitlyUnresolved: new Set(context.unresolved.map((miss) => normalise(miss.reference))),
  };
}

function pathContains(path: string, segment: string): boolean {
  return path.toLocaleLowerCase("en").includes(segment.toLocaleLowerCase("en"));
}

function inferKind(key: string, path: string): GroundingIssueKind | null {
  const compactKey = key.replace(/[^a-z0-9]/gi, "").toLocaleLowerCase("en");
  if (compactKey.includes("phase")) return "phase";
  if (
    compactKey.includes("date") ||
    compactKey.includes("deadline") ||
    compactKey === "sincewhen" ||
    compactKey.endsWith("timestamp")
  ) return "date";
  if (
    compactKey.includes("projectid") ||
    compactKey.includes("projectcode") ||
    compactKey.includes("projecttitle") ||
    compactKey.includes("projectname") ||
    compactKey === "projectlink" ||
    compactKey === "project"
  ) return "project";
  if (
    compactKey.includes("userid") ||
    compactKey.includes("assigneeid") ||
    compactKey === "owner" ||
    compactKey === "ownername" ||
    compactKey === "assignedto" ||
    compactKey === "assignee" ||
    compactKey === "assigneename" ||
    compactKey === "username" ||
    compactKey === "reviewer" ||
    compactKey === "reviewername" ||
    compactKey === "author" ||
    compactKey === "authorname" ||
    compactKey === "whodecided" ||
    compactKey === "speaker" ||
    compactKey === "askedby" ||
    compactKey === "directedto"
  ) return "user";
  if (
    ["present", "absent", "leftearly", "participants", "teaminitials"].includes(compactKey)
  ) return "user";
  if (
    ["name", "email", "initials"].includes(compactKey) &&
    (pathContains(path, ".people[") || pathContains(path, ".attendance."))
  ) return "user";
  if (
    ["code", "title"].includes(compactKey) &&
    pathContains(path, ".projects[")
  ) return "project";
  return null;
}

function isIdOrCodeField(key: string): boolean {
  const compactKey = key.replace(/[^a-z0-9]/gi, "").toLocaleLowerCase("en");
  return compactKey.endsWith("id") || compactKey.includes("code") || compactKey === "projectlink";
}

function splitUserValues(value: string): string[] {
  return value.split(/\s*(?:,|;|&|\+|\band\b)\s*/i).filter(Boolean);
}

function valueIsAllowed(
  kind: GroundingIssueKind,
  value: string,
  allowed: AllowedGroundingValues,
): boolean {
  const normalised = normalise(value);
  if (!normalised) return false;
  if (allowed.explicitlyUnresolved.has(normalised)) return false;
  if (kind === "user") {
    const parts = splitUserValues(value);
    return parts.length > 0 && parts.every((part) => allowed.users.has(normalise(part)));
  }
  if (kind === "project") return allowed.projects.has(normalised);
  if (kind === "phase") return allowed.phases.has(normalised);
  if (allowed.dates.has(normalised)) return true;
  return [...allowed.dates].some((resolvedDate) => normalised.startsWith(`${resolvedDate} `));
}

function issueSeverity(kind: GroundingIssueKind, key: string): GroundingIssueSeverity {
  if (kind === "date") return "warning";
  if (kind === "user" && !isIdOrCodeField(key)) return "warning";
  return "error";
}

function addIssue(
  issues: GroundingValidationIssue[],
  options: GroundingValidationOptions,
  kind: GroundingIssueKind,
  key: string,
  path: string,
  value: string,
  canStrip: boolean,
): typeof STRIPPED | string {
  const severity = issueSeverity(kind, key);
  const strip = options.mode === "strip" && severity === "error" && canStrip;
  issues.push({
    kind,
    path,
    value,
    severity,
    action: strip ? "stripped" : "flagged",
    reason: "not-in-resolved-context",
  });
  return strip ? STRIPPED : value;
}

function scanUnknownProjectCodes(
  value: string,
  path: string,
  allowed: AllowedGroundingValues,
  issues: GroundingValidationIssue[],
): void {
  const codes = value.match(/\bDBS-?\d[A-Z0-9]*(?:-[A-Z0-9]+)*\b/gi) ?? [];
  for (const code of codes) {
    if (allowed.projectCodes.has(normalise(code))) continue;
    if (issues.some((issue) => issue.path === path && normalise(issue.value) === normalise(code))) {
      continue;
    }
    issues.push({
      kind: "project",
      path,
      value: code,
      severity: "error",
      action: "flagged",
      reason: "not-in-resolved-context",
    });
  }
}

function validateTable(
  value: Record<string, unknown>,
  path: string,
  allowed: AllowedGroundingValues,
  issues: GroundingValidationIssue[],
): void {
  if (value.type !== "table" || !Array.isArray(value.columns) || !Array.isArray(value.rows)) return;
  const columns = value.columns.map((column) => String(column));
  value.rows.forEach((row, rowIndex) => {
    if (!Array.isArray(row)) return;
    row.forEach((cell, columnIndex) => {
      if (typeof cell !== "string") return;
      const column = columns[columnIndex] ?? "";
      const kind = inferKind(column, `table.${normalise(column)}`);
      if (kind && !valueIsAllowed(kind, cell, allowed)) {
        addIssue(
          issues,
          { mode: "flag" },
          kind,
          column,
          `${path}.rows[${rowIndex}][${columnIndex}]`,
          cell,
          false,
        );
      }
    });
  });
}

function walk(
  value: unknown,
  key: string,
  path: string,
  allowed: AllowedGroundingValues,
  issues: GroundingValidationIssue[],
  options: GroundingValidationOptions,
): unknown | typeof STRIPPED {
  if (typeof value === "string") {
    const kind = inferKind(key, path);
    if (kind && !valueIsAllowed(kind, value, allowed)) {
      return addIssue(issues, options, kind, key, path, value, true);
    }
    scanUnknownProjectCodes(value, path, allowed, issues);
    return value;
  }
  if (Array.isArray(value)) {
    const kind = inferKind(key, path);
    const output: unknown[] = [];
    value.forEach((item, index) => {
      const itemPath = `${path}[${index}]`;
      if (typeof item === "string" && kind && !valueIsAllowed(kind, item, allowed)) {
        const validated = addIssue(issues, options, kind, key, itemPath, item, true);
        if (validated !== STRIPPED) output.push(validated);
      } else {
        const validated = walk(item, key, itemPath, allowed, issues, options);
        if (validated !== STRIPPED) output.push(validated);
      }
    });
    return output;
  }
  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>;
    validateTable(record, path, allowed, issues);
    const output: Record<string, unknown> = {};
    for (const [childKey, child] of Object.entries(record)) {
      const childPath = path ? `${path}.${childKey}` : childKey;
      const validated = walk(child, childKey, childPath, allowed, issues, options);
      output[childKey] = validated === STRIPPED ? null : validated;
    }
    return output;
  }
  return value;
}

/**
 * Validate a structured provider result against exactly what the grounding
 * contract resolved. The input is never mutated.
 */
export function validateGrounding<T>(
  output: T,
  resolved: ResolvedContext,
  options: GroundingValidationOptions = {},
): GroundingValidationResult<T> {
  const issues: GroundingValidationIssue[] = [];
  const validated = walk(output, "", "$", buildAllowedValues(resolved), issues, options);
  return {
    output: validated as T,
    issues,
    valid: !issues.some((issue) => issue.severity === "error"),
  };
}
