import type { ResolvedContext } from "./grounding";

export type GroundingIssueKind = "user" | "project" | "phase" | "date" | "entity";
export type GroundingIssueSeverity = "warning" | "error";
export type GroundingIssueAction = "flagged" | "stripped";

export interface GroundingValidationIssue {
  kind: GroundingIssueKind;
  path: string;
  value: string;
  severity: GroundingIssueSeverity;
  action: GroundingIssueAction;
  reason:
    | "not-in-resolved-context"
    | "missing-entity-citation"
    | "inconsistent-entity-reference";
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
  isoDates: Set<string>;
  explicitlyUnresolved: Set<string>;
  userAliasIds: Map<string, Set<string>>;
  projectAliasIds: Map<string, Set<string>>;
  phaseAliasValues: Map<string, Set<string>>;
  dateAliasValues: Map<string, Set<string>>;
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
  const userAliasIds = new Map<string, Set<string>>();
  for (const user of context.users) {
    for (const value of [user.id, user.name, user.email, ...user.aliases]) {
      const alias = normalise(value);
      users.add(alias);
      const ids = userAliasIds.get(alias) ?? new Set<string>();
      ids.add(user.id);
      userAliasIds.set(alias, ids);
    }
  }

  const projects = new Set<string>();
  const projectCodes = new Set<string>();
  const projectAliasIds = new Map<string, Set<string>>();
  for (const project of context.projects) {
    for (const value of [project.id, project.code, project.title, ...project.aliases]) {
      const alias = normalise(value);
      projects.add(alias);
      const ids = projectAliasIds.get(alias) ?? new Set<string>();
      ids.add(project.id);
      projectAliasIds.set(alias, ids);
    }
    projectCodes.add(normalise(project.code));
  }
  for (const decision of context.recentMeetingDecisions) {
    const alias = normalise(decision.projectId);
    projects.add(alias);
    const ids = projectAliasIds.get(alias) ?? new Set<string>();
    ids.add(decision.projectId);
    projectAliasIds.set(alias, ids);
  }

  const phaseAliasValues = new Map<string, Set<string>>();
  for (const phase of context.phases) {
    for (const value of [phase.value, ...phase.aliases]) {
      const alias = normalise(value);
      const values = phaseAliasValues.get(alias) ?? new Set<string>();
      values.add(phase.value);
      phaseAliasValues.set(alias, values);
    }
  }
  for (const project of context.projects) {
    const alias = normalise(project.phase);
    const values = phaseAliasValues.get(alias) ?? new Set<string>();
    values.add(project.phase);
    phaseAliasValues.set(alias, values);
  }

  const dateAliasValues = new Map<string, Set<string>>();
  const dateValues = context.dates.flatMap((date) => [date.source, date.isoDate]);
  for (const date of context.dates) {
    for (const value of [date.source, date.isoDate]) {
      const alias = normalise(value);
      const values = dateAliasValues.get(alias) ?? new Set<string>();
      values.add(date.isoDate);
      dateAliasValues.set(alias, values);
    }
  }
  for (const decision of context.recentMeetingDecisions) {
    if (!decision.decidedAt) continue;
    const canonical = canonicalDate(decision.decidedAt);
    if (!canonical) continue;
    dateValues.push(decision.decidedAt, canonical);
    for (const value of [decision.decidedAt, canonical]) {
      const alias = normalise(value);
      const values = dateAliasValues.get(alias) ?? new Set<string>();
      values.add(canonical);
      dateAliasValues.set(alias, values);
    }
  }

  return {
    users,
    projects,
    projectCodes,
    phases: new Set([
      ...context.phases.map((phase) => normalise(phase.value)),
      ...context.projects.map((project) => normalise(project.phase)),
    ]),
    dates: new Set(dateValues.map(normalise)),
    isoDates: new Set(dateValues.flatMap((value) => {
      const canonical = canonicalDate(value);
      return canonical ? [canonical] : [];
    })),
    explicitlyUnresolved: new Set(context.unresolved.map((miss) => normalise(miss.reference))),
    userAliasIds,
    projectAliasIds,
    phaseAliasValues,
    dateAliasValues,
  };
}

function referenceArray(
  record: Record<string, unknown>,
  keys: readonly string[],
): { key: string; values: string[] } | null {
  for (const key of keys) {
    const value = record[key];
    if (Array.isArray(value) && value.every((item) => typeof item === "string")) {
      return { key, values: value };
    }
  }
  return null;
}

function collectOutputText(value: unknown, key = ""): string[] {
  const compactKey = key.replace(/[^a-z0-9]/gi, "").toLocaleLowerCase("en");
  if (["userids", "projectids", "phases", "dates"].includes(compactKey)) return [];
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap((item) => collectOutputText(item, key));
  if (typeof value !== "object" || value === null) return [];
  return Object.entries(value).flatMap(([childKey, child]) => collectOutputText(child, childKey));
}

function mentionedEntityIds(
  text: string,
  aliases: Map<string, Set<string>>,
): Set<string> {
  const normalisedText = ` ${normalise(text)} `;
  const mentioned = new Set<string>();
  for (const [alias, ids] of aliases) {
    if (alias.length < 3 || ids.size !== 1 || !normalisedText.includes(` ${alias} `)) continue;
    mentioned.add([...ids][0]);
  }
  return mentioned;
}

function mentionedGroundingValues(
  text: string,
  aliases: Map<string, Set<string>>,
): Set<string> {
  const normalisedText = ` ${normalise(text)} `;
  const mentioned = new Set<string>();
  for (const [alias, values] of aliases) {
    if (!alias || values.size !== 1 || !normalisedText.includes(` ${alias} `)) continue;
    mentioned.add([...values][0]);
  }
  return mentioned;
}

function citedGroundingValues(
  references: readonly string[],
  aliases: Map<string, Set<string>>,
): Set<string> {
  const cited = new Set<string>();
  for (const reference of references) {
    const values = aliases.get(normalise(reference));
    if (values?.size === 1) cited.add([...values][0]);
  }
  return cited;
}

function validateEntityCitations(
  value: Record<string, unknown>,
  path: string,
  allowed: AllowedGroundingValues,
  issues: GroundingValidationIssue[],
): void {
  const userReferences = referenceArray(value, ["userIds", "user_ids"]);
  const projectReferences = referenceArray(value, ["projectIds", "project_ids"]);
  const phaseReferences = referenceArray(value, ["phases"]);
  const dateReferences = referenceArray(value, ["dates"]);
  if (!userReferences && !projectReferences && !phaseReferences && !dateReferences) return;

  const text = collectOutputText(value).join(" ");
  const missing: Array<{ kind: GroundingIssueKind; key: string; id: string }> = [];
  if (userReferences) {
    const citedUsers = new Set(userReferences.values);
    missing.push(...[...mentionedEntityIds(text, allowed.userAliasIds)]
      .filter((id) => !citedUsers.has(id))
      .map((id) => ({ kind: "user" as const, key: userReferences.key, id })));
  }
  if (projectReferences) {
    const citedProjects = new Set(projectReferences.values);
    missing.push(...[...mentionedEntityIds(text, allowed.projectAliasIds)]
      .filter((id) => !citedProjects.has(id))
      .map((id) => ({ kind: "project" as const, key: projectReferences.key, id })));
  }
  if (phaseReferences) {
    const citedPhases = citedGroundingValues(phaseReferences.values, allowed.phaseAliasValues);
    missing.push(...[...mentionedGroundingValues(text, allowed.phaseAliasValues)]
      .filter((phase) => !citedPhases.has(phase))
      .map((phase) => ({ kind: "phase" as const, key: phaseReferences.key, id: phase })));
  }
  if (dateReferences) {
    const citedDates = citedGroundingValues(dateReferences.values, allowed.dateAliasValues);
    missing.push(...[...mentionedGroundingValues(text, allowed.dateAliasValues)]
      .filter((date) => !citedDates.has(date))
      .map((date) => ({ kind: "date" as const, key: dateReferences.key, id: date })));
  }
  for (const item of missing) {
    issues.push({
      kind: item.kind,
      path: `${path}.${item.key}`,
      value: item.id,
      severity: "error",
      action: "flagged",
      reason: "missing-entity-citation",
    });
  }
}

function inferKind(key: string, path: string): GroundingIssueKind | null {
  const compactKey = key.replace(/[^a-z0-9]/gi, "").toLocaleLowerCase("en");
  if (compactKey.includes("phase")) return "phase";
  if (
    compactKey.includes("date") ||
    compactKey.includes("deadline") ||
    compactKey === "sincewhen" ||
    ["dueat", "startat", "endat", "scheduledat", "decidedat"].includes(compactKey) ||
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
    compactKey.endsWith("assigneeid") ||
    compactKey.endsWith("ownerid") ||
    compactKey.endsWith("attendeeid") ||
    compactKey.endsWith("participantid") ||
    compactKey.endsWith("memberid") ||
    compactKey.endsWith("personid") ||
    compactKey.endsWith("speakerid") ||
    compactKey.endsWith("authorid") ||
    compactKey.endsWith("reviewerid") ||
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
    ["id", "name", "email", "initials"].includes(compactKey) &&
    pathContainsAny(path, USER_COLLECTIONS)
  ) return "user";
  if (
    ["id", "code", "title", "name"].includes(compactKey) &&
    pathContainsAny(path, PROJECT_COLLECTIONS)
  ) return "project";
  return null;
}

const USER_COLLECTIONS = [
  ".users[",
  ".people[",
  ".participants[",
  ".attendees[",
  ".team[",
  ".members[",
  ".attendance.",
] as const;
const PROJECT_COLLECTIONS = [".projects[", ".project."] as const;

function pathContainsAny(path: string, segments: readonly string[]): boolean {
  const lowered = path.toLocaleLowerCase("en");
  return segments.some((segment) => lowered.includes(segment));
}

function relationshipGroup(
  key: string,
  path: string,
  kind: GroundingIssueKind,
): string | null {
  const compact = key.replace(/[^a-z0-9]/gi, "").toLocaleLowerCase("en");
  const suffixes = ["", "id", "userid", "name", "email", "initials", "code", "title"];
  if (kind === "user") {
    if (pathContainsAny(path, USER_COLLECTIONS) &&
      ["id", "userid", "name", "username", "email", "initials"].includes(compact)) {
      return "user:collection";
    }
    for (const prefix of [
      "user", "owner", "assignee", "attendee", "participant", "member",
      "person", "speaker", "author", "reviewer", "whodecided",
    ]) {
      if (suffixes.some((suffix) => compact === `${prefix}${suffix}`)) return `user:${prefix}`;
    }
  }
  if (kind === "project") {
    if (pathContainsAny(path, PROJECT_COLLECTIONS) &&
      ["id", "projectid", "code", "projectcode", "title", "projecttitle", "name", "projectname"]
        .includes(compact)) {
      return "project:collection";
    }
    if (suffixes.some((suffix) => compact === `project${suffix}`)) return "project:project";
  }
  return null;
}

function validateStructuredEntityRelationships(
  value: Record<string, unknown>,
  path: string,
  allowed: AllowedGroundingValues,
  issues: GroundingValidationIssue[],
): void {
  const candidates = new Map<
    string,
    Array<{ path: string; value: string; ids: Set<string>; kind: "user" | "project" }>
  >();
  for (const [key, item] of Object.entries(value)) {
    if (typeof item !== "string") continue;
    const childPath = `${path}.${key}`;
    const kind = inferKind(key, childPath);
    if (kind !== "user" && kind !== "project") continue;
    const group = relationshipGroup(key, childPath, kind);
    if (!group) continue;
    const aliases = kind === "user" ? allowed.userAliasIds : allowed.projectAliasIds;
    const ids = aliases.get(normalise(item));
    if (!ids?.size) continue;
    const values = candidates.get(group) ?? [];
    values.push({ path: childPath, value: item, ids, kind });
    candidates.set(group, values);
  }

  for (const relatedValues of candidates.values()) {
    if (relatedValues.length < 2) continue;
    let compatible = new Set(relatedValues[0].ids);
    for (const related of relatedValues.slice(1)) {
      const overlap = new Set([...compatible].filter((id) => related.ids.has(id)));
      if (overlap.size) {
        compatible = overlap;
        continue;
      }
      issues.push({
        kind: related.kind,
        path: related.path,
        value: related.value,
        severity: "error",
        action: "flagged",
        reason: "inconsistent-entity-reference",
      });
    }
  }
}

function isIdOrCodeField(key: string): boolean {
  const compactKey = key.replace(/[^a-z0-9]/gi, "").toLocaleLowerCase("en");
  return compactKey.endsWith("id") || compactKey.includes("code") || compactKey === "projectlink";
}

function splitUserValues(value: string): string[] {
  return value.split(/\s*(?:,|;|&|\+|\band\b)\s*/i).filter(Boolean);
}

function canonicalDate(value: string): string | null {
  const iso = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})(?:$|[T\s])/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const european = value.trim().match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/);
  if (!european) return null;
  return `${european[3]}-${european[2].padStart(2, "0")}-${european[1].padStart(2, "0")}`;
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
    return parts.length > 0 && parts.every((part) =>
      allowed.userAliasIds.get(normalise(part))?.size === 1);
  }
  if (kind === "project") return allowed.projectAliasIds.get(normalised)?.size === 1;
  if (kind === "phase") return allowed.phases.has(normalised);
  if (allowed.dates.has(normalised)) return true;
  const canonical = canonicalDate(value);
  if (canonical) return allowed.isoDates.has(canonical);
  return [...allowed.dates].some((resolvedDate) => normalised.startsWith(`${resolvedDate} `));
}

function issueSeverity(kind: GroundingIssueKind, key: string): GroundingIssueSeverity {
  if (kind === "date") return "warning";
  if (kind === "user" && !isIdOrCodeField(key)) return "warning";
  return "error";
}

function appendIssue(
  issues: GroundingValidationIssue[],
  issue: GroundingValidationIssue,
): void {
  if (issues.some((existing) =>
    existing.kind === issue.kind &&
    existing.path === issue.path &&
    normalise(existing.value) === normalise(issue.value))) return;
  issues.push(issue);
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
  appendIssue(issues, {
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
    appendIssue(issues, {
      kind: "project",
      path,
      value: code,
      severity: "error",
      action: "flagged",
      reason: "not-in-resolved-context",
    });
  }
}

function scanUnknownDates(
  value: string,
  path: string,
  allowed: AllowedGroundingValues,
  issues: GroundingValidationIssue[],
): void {
  const references = [...new Set([
    ...(value.match(/\b\d{4}-\d{2}-\d{2}\b/g) ?? []),
    ...(value.match(/\b\d{1,2}[/.]\d{1,2}[/.]\d{4}\b/g) ?? []),
  ])];
  for (const reference of references) {
    if (valueIsAllowed("date", reference, allowed)) continue;
    appendIssue(issues, {
      kind: "date",
      path,
      value: reference,
      severity: "warning",
      action: "flagged",
      reason: "not-in-resolved-context",
    });
  }
}

const NATURAL_ENTITY_ALLOWLIST = new Set([
  "ai assistant",
  "dbs architectes",
  "dbs gpt",
  "openai",
  "read ai",
]);

function scanUnknownNaturalEntities(
  value: string,
  path: string,
  allowed: AllowedGroundingValues,
  issues: GroundingValidationIssue[],
): void {
  if (path.includes(".rows[")) return;
  const candidates = value.match(
    /\p{Lu}[\p{L}'’.-]+(?:\s+\p{Lu}[\p{L}'’.-]+){1,3}/gu,
  ) ?? [];
  for (const candidate of new Set(candidates)) {
    const reference = normalise(candidate);
    if (
      /\bDBS-?\d/i.test(candidate) ||
      /\b(?:DBS|AI|GPT)\b/.test(candidate) ||
      /\d{4}-\d{2}-\d{2}/.test(candidate) ||
      NATURAL_ENTITY_ALLOWLIST.has(reference) ||
      allowed.users.has(reference) ||
      allowed.projects.has(reference) ||
      allowed.phases.has(reference)
    ) continue;
    appendIssue(issues, {
      kind: "entity",
      path,
      value: candidate,
      severity: "warning",
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
    scanUnknownDates(value, path, allowed, issues);
    if (!kind) scanUnknownNaturalEntities(value, path, allowed, issues);
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
    validateStructuredEntityRelationships(record, path, allowed, issues);
    if (path === "$") validateEntityCitations(record, path, allowed, issues);
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
