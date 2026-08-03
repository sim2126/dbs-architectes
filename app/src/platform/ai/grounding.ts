export type AiSurface =
  | "meeting-summary"
  | "dbs-gpt"
  | "chat-agent"
  | "translation"
  | "project-health";

export interface GroundingSubject {
  userId: string;
  role: string;
}

export type EntityResolutionNeed =
  | { scope: "none" }
  | { scope: "mentions" }
  | { scope: "workspace" }
  | { scope: "ids"; ids: readonly string[] };

export type PhaseResolutionNeed =
  | { scope: "none" }
  | { scope: "mentions" }
  | { scope: "values"; values: readonly string[] };

export type DateResolutionNeed =
  | { scope: "none" }
  | { scope: "mentions" }
  | { scope: "values"; values: readonly string[] };

export type MeetingDecisionNeed =
  | { scope: "none" }
  | { scope: "recent"; projectIds?: readonly string[]; limit: number };

/**
 * The declaration every AI surface must make before invoking a provider.
 * All fields are required so a surface cannot accidentally omit a grounding
 * category as it evolves.
 */
export interface GroundingContract {
  surface: AiSurface;
  subject: GroundingSubject;
  input: string;
  users: EntityResolutionNeed;
  projects: EntityResolutionNeed;
  phases: PhaseResolutionNeed;
  dates: DateResolutionNeed;
  recentMeetingDecisions: MeetingDecisionNeed;
}

export interface ResolvedUser {
  kind: "user";
  id: string;
  name: string;
  email: string;
  aliases: string[];
}

export interface ResolvedProject {
  kind: "project";
  id: string;
  code: string;
  title: string;
  phase: string;
  client: string | null;
  commune: string | null;
  aliases: string[];
}

export interface ResolvedPhase {
  kind: "phase";
  value: string;
  aliases: string[];
}

export interface ResolvedDate {
  kind: "date";
  source: string;
  isoDate: string;
  precision: "day" | "week";
}

export interface ResolvedMeetingDecision {
  kind: "meeting-decision";
  memoryId: string;
  projectId: string;
  text: string;
  decidedBy: string | null;
  decidedAt: string | null;
}

export interface GroundingMiss {
  kind: "user" | "project" | "phase" | "date" | "meeting-decision";
  reference: string;
  reason: "not-found" | "invalid";
}

export interface ResolvedContext {
  surface: AiSurface;
  resolvedAt: string;
  users: ResolvedUser[];
  projects: ResolvedProject[];
  mentionedUserIds: string[];
  mentionedProjectIds: string[];
  phases: ResolvedPhase[];
  dates: ResolvedDate[];
  recentMeetingDecisions: ResolvedMeetingDecision[];
  unresolved: GroundingMiss[];
}

interface GroundingUserRow {
  id: string;
  name: string | null;
  email: string;
  initials: string | null;
}

interface GroundingProjectRow {
  id: string;
  code: string;
  title: string;
  phase: string;
  client: string | null;
  commune: string | null;
}

interface GroundingMemoryRow {
  id: string;
  projectId: string;
  keyDecisions: unknown;
  updatedAt: Date;
}

export interface GroundingDataSource {
  listUsers(subject: GroundingSubject): Promise<GroundingUserRow[]>;
  listProjects(subject: GroundingSubject): Promise<GroundingProjectRow[]>;
  listMeetingMemories(projectIds: readonly string[]): Promise<GroundingMemoryRow[]>;
}

const WORKSPACE_PROJECT_ROLES = new Set([
  "admin",
  "super_admin",
]);

export function canResolveEntireProjectPortfolio(role: string): boolean {
  return WORKSPACE_PROJECT_ROLES.has(role);
}

export const prismaGroundingDataSource: GroundingDataSource = {
  async listUsers() {
    const { prisma } = await import("@/platform/db");
    return prisma.user.findMany({
      where: { isActive: true },
      orderBy: [{ name: "asc" }, { email: "asc" }],
      select: { id: true, name: true, email: true, initials: true },
    });
  },

  async listProjects(subject) {
    const { prisma } = await import("@/platform/db");
    return prisma.project.findMany({
      where: {
        status: { not: "deleted" },
        ...(canResolveEntireProjectPortfolio(subject.role)
          ? {}
          : { assignments: { some: { userId: subject.userId } } }),
      },
      orderBy: { code: "asc" },
      select: {
        id: true,
        code: true,
        title: true,
        phase: true,
        client: true,
        commune: true,
      },
    });
  },

  async listMeetingMemories(projectIds) {
    if (projectIds.length === 0) return [];
    const { prisma } = await import("@/platform/db");
    return prisma.projectMeetingMemory.findMany({
      where: { projectId: { in: [...projectIds] } },
      orderBy: { updatedAt: "desc" },
      select: { id: true, projectId: true, keyDecisions: true, updatedAt: true },
    });
  },
};

const CANONICAL_PHASES = [
  "ETUDE/AP",
  "MAE",
  "CHANTIER",
  "EXE/DG/DV/3D",
  "TERMINATO",
  "STUCK",
  "CONCORSO",
] as const;

function normalise(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("en")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function unique(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value?.trim())))];
}

function containsAlias(input: string, alias: string): boolean {
  const normalisedAlias = normalise(alias);
  if (!normalisedAlias) return false;
  return ` ${input} `.includes(` ${normalisedAlias} `);
}

function userAliases(row: GroundingUserRow, uniqueFirstNames: Set<string>): string[] {
  const nameParts = (row.name ?? "").trim().split(/\s+/).filter(Boolean);
  const firstName = nameParts[0];
  const emailLocal = row.email.split("@")[0];
  return unique([
    row.name,
    row.email,
    emailLocal,
    row.initials,
    firstName && uniqueFirstNames.has(normalise(firstName)) ? firstName : null,
  ]);
}

function removeAmbiguousAliases(
  aliasesByUser: readonly string[][],
): { aliasesByEntity: string[][]; ambiguousAliases: Map<string, string> } {
  const aliasOwners = new Map<string, Set<number>>();
  const aliasLabels = new Map<string, string>();
  aliasesByUser.forEach((aliases, userIndex) => {
    for (const alias of aliases) {
      const key = normalise(alias);
      if (!key) continue;
      const owners = aliasOwners.get(key) ?? new Set<number>();
      owners.add(userIndex);
      aliasOwners.set(key, owners);
      aliasLabels.set(key, alias);
    }
  });
  const ambiguousAliases = new Map(
    [...aliasOwners]
      .filter(([, owners]) => owners.size > 1)
      .map(([key]) => [key, aliasLabels.get(key) ?? key]),
  );
  return {
    aliasesByEntity: aliasesByUser.map((aliases) =>
      aliases.filter((alias) => !ambiguousAliases.has(normalise(alias)))),
    ambiguousAliases,
  };
}

function selectEntities<T extends { id: string; aliases: string[] }>(
  entities: T[],
  need: EntityResolutionNeed,
  input: string,
  kind: "user" | "project",
): { resolved: T[]; unresolved: GroundingMiss[] } {
  if (need.scope === "none") return { resolved: [], unresolved: [] };
  if (need.scope === "workspace") return { resolved: entities, unresolved: [] };
  if (need.scope === "mentions") {
    return {
      resolved: entities.filter((entity) => entity.aliases.some((alias) => containsAlias(input, alias))),
      unresolved: [],
    };
  }

  const byId = new Map(entities.map((entity) => [entity.id, entity]));
  const resolved = need.ids.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []));
  const unresolved = need.ids
    .filter((id) => !byId.has(id))
    .map((id): GroundingMiss => ({ kind, reference: id, reason: "not-found" }));
  return { resolved, unresolved };
}

function unresolvedInputMentions(
  contract: GroundingContract,
  users: readonly ResolvedUser[],
  projects: readonly ResolvedProject[],
  ambiguousUserAliases: ReadonlyMap<string, string>,
  ambiguousProjectAliases: ReadonlyMap<string, string>,
): GroundingMiss[] {
  const misses: GroundingMiss[] = [];
  if (contract.users.scope !== "none") {
    const knownUsers = new Set(users.flatMap((user) => [user.id, user.email, ...user.aliases]).map(normalise));
    const references = [
      ...(contract.input.match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi) ?? []),
      ...[...contract.input.matchAll(/\buser(?:_?id)?\s*[:=]\s*([A-Z0-9_-]+)/gi)]
        .map((match) => match[1]),
    ];
    for (const reference of unique(references)) {
      if (!knownUsers.has(normalise(reference))) {
        misses.push({ kind: "user", reference, reason: "not-found" });
      }
    }
    for (const [alias, label] of ambiguousUserAliases) {
      if (containsAlias(normalise(contract.input), alias)) {
        misses.push({ kind: "user", reference: label, reason: "invalid" });
      }
    }
  }
  if (contract.projects.scope !== "none") {
    const knownProjects = new Set(
      projects.flatMap((project) => [project.id, project.code, ...project.aliases]).map(normalise),
    );
    const references = [
      ...(contract.input.match(/\bDBS-?\d[A-Z0-9]*(?:-[A-Z0-9]+)*\b/gi) ?? []),
      ...[...contract.input.matchAll(/\bproject(?:_?id)?\s*[:=]\s*([A-Z0-9_-]+)/gi)]
        .map((match) => match[1]),
    ];
    for (const reference of unique(references)) {
      if (!knownProjects.has(normalise(reference))) {
        misses.push({ kind: "project", reference, reason: "not-found" });
      }
    }
    for (const [alias, label] of ambiguousProjectAliases) {
      if (containsAlias(normalise(contract.input), alias)) {
        misses.push({ kind: "project", reference: label, reason: "invalid" });
      }
    }
  }
  return misses;
}

function resolvePhases(
  need: PhaseResolutionNeed,
  input: string,
): { phases: ResolvedPhase[]; unresolved: GroundingMiss[] } {
  if (need.scope === "none") return { phases: [], unresolved: [] };
  const canonicalByValue = new Map(
    CANONICAL_PHASES.map((value) => [value.toUpperCase().replace(/\s*\/\s*/g, "/"), value]),
  );
  const requestedValues = need.scope === "values" ? need.values : CANONICAL_PHASES;
  const compactInput = input.toUpperCase().replace(/\s*\/\s*/g, "/");
  const unresolved: GroundingMiss[] = [];
  const values = unique(requestedValues.map((value) => value.trim())).flatMap((value) => {
    const canonical = canonicalByValue.get(value.toUpperCase().replace(/\s*\/\s*/g, "/"));
    if (!canonical) {
      unresolved.push({ kind: "phase", reference: value, reason: "invalid" });
      return [];
    }
    return [canonical];
  });
  const phases = unique(values)
    .filter((value) => need.scope === "values" || compactInput.includes(value))
    .map((value) => ({
      kind: "phase" as const,
      value,
      aliases: unique([value, value.replaceAll("/", " / ")]),
    }));
  return { phases, unresolved };
}

function toIsoDate(year: number, month: number, day: number): string | null {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date.toISOString().slice(0, 10);
}

function resolveDates(
  need: DateResolutionNeed,
  input: string,
  now: Date,
): { dates: ResolvedDate[]; unresolved: GroundingMiss[] } {
  if (need.scope === "none") return { dates: [], unresolved: [] };
  const values = need.scope === "values" ? [...need.values] : [];
  if (need.scope === "mentions") {
    values.push(...(input.match(/\b\d{4}-\d{2}-\d{2}\b/g) ?? []));
    values.push(...(input.match(/\b\d{1,2}[/.]\d{1,2}[/.]\d{4}\b/g) ?? []));
    const lowered = input.toLocaleLowerCase("en");
    for (const relative of ["today", "tomorrow", "yesterday", "next week"] as const) {
      if (lowered.includes(relative)) values.push(relative);
    }
  }

  const dates: ResolvedDate[] = [];
  const unresolved: GroundingMiss[] = [];
  for (const source of unique(values)) {
    const lowered = source.toLocaleLowerCase("en");
    const relativeDays = lowered === "tomorrow" ? 1 : lowered === "yesterday" ? -1 : 0;
    let isoDate: string | null = null;
    let precision: "day" | "week" = "day";
    if (["today", "tomorrow", "yesterday"].includes(lowered)) {
      const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
      date.setUTCDate(date.getUTCDate() + relativeDays);
      isoDate = date.toISOString().slice(0, 10);
    } else if (lowered === "next week") {
      const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
      date.setUTCDate(date.getUTCDate() + ((8 - date.getUTCDay()) % 7 || 7));
      isoDate = date.toISOString().slice(0, 10);
      precision = "week";
    } else {
      const isoMatch = source.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      const europeanMatch = source.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/);
      if (isoMatch) isoDate = toIsoDate(+isoMatch[1], +isoMatch[2], +isoMatch[3]);
      if (europeanMatch) isoDate = toIsoDate(+europeanMatch[3], +europeanMatch[2], +europeanMatch[1]);
    }

    if (isoDate) dates.push({ kind: "date", source, isoDate, precision });
    else unresolved.push({ kind: "date", reference: source, reason: "invalid" });
  }
  return { dates, unresolved };
}

function resolveDecisions(
  memories: GroundingMemoryRow[],
  limit: number,
  users: readonly ResolvedUser[],
): { decisions: ResolvedMeetingDecision[]; unresolved: GroundingMiss[] } {
  const unresolved: GroundingMiss[] = [];
  const decisions = memories.flatMap((memory) => {
    if (!Array.isArray(memory.keyDecisions)) return [];
    return memory.keyDecisions.flatMap((item): ResolvedMeetingDecision[] => {
      if (!item || typeof item !== "object") return [];
      const decision = item as Record<string, unknown>;
      const text = typeof decision.what === "string" ? decision.what.trim() : "";
      if (!text) return [];
      const decidedByReference = typeof decision.who === "string" ? decision.who.trim() : "";
      const decidedBy = decidedByReference
        ? users.find((user) => [user.id, ...user.aliases]
            .some((alias) => normalise(alias) === normalise(decidedByReference)))
        : undefined;
      if (decidedByReference && !decidedBy) {
        unresolved.push({ kind: "user", reference: decidedByReference, reason: "not-found" });
      }
      return [{
        kind: "meeting-decision",
        memoryId: memory.id,
        projectId: memory.projectId,
        text,
        decidedBy: decidedBy?.id ?? null,
        decidedAt:
          typeof decision.at === "string" ? decision.at : memory.updatedAt.toISOString(),
      }];
    });
  });
  return {
    decisions: decisions
      .sort((a, b) => (b.decidedAt ?? "").localeCompare(a.decidedAt ?? ""))
      .slice(0, Math.max(0, limit)),
    unresolved,
  };
}

export async function resolveGrounding(
  contract: GroundingContract,
  options: {
    dataSource?: GroundingDataSource;
    now?: Date;
  } = {},
): Promise<ResolvedContext> {
  const dataSource = options.dataSource ?? prismaGroundingDataSource;
  const [userRows, projectRows] = await Promise.all([
    contract.users.scope === "none" ? Promise.resolve([]) : dataSource.listUsers(contract.subject),
    contract.projects.scope === "none" && contract.recentMeetingDecisions.scope === "none"
      ? Promise.resolve([])
      : dataSource.listProjects(contract.subject),
  ]);

  const firstNameCounts = new Map<string, number>();
  for (const row of userRows) {
    const firstName = normalise((row.name ?? "").split(/\s+/)[0] ?? "");
    if (firstName) firstNameCounts.set(firstName, (firstNameCounts.get(firstName) ?? 0) + 1);
  }
  const uniqueFirstNames = new Set(
    [...firstNameCounts].filter(([, count]) => count === 1).map(([name]) => name),
  );

  const candidateAliases = userRows.map((row) => userAliases(row, uniqueFirstNames));
  const disambiguatedUsers = removeAmbiguousAliases(candidateAliases);
  const allUsers: ResolvedUser[] = userRows.map((row, index) => ({
    kind: "user",
    id: row.id,
    name: row.name?.trim() || row.email,
    email: row.email,
    aliases: disambiguatedUsers.aliasesByEntity[index],
  }));
  const disambiguatedProjects = removeAmbiguousAliases(
    projectRows.map((row) => unique([row.code, row.title])),
  );
  const allProjects: ResolvedProject[] = projectRows.map((row, index) => ({
    kind: "project",
    id: row.id,
    code: row.code,
    title: row.title,
    phase: row.phase,
    client: row.client,
    commune: row.commune,
    aliases: disambiguatedProjects.aliasesByEntity[index],
  }));

  const normalisedInput = normalise(contract.input);
  const selectedUsers = selectEntities(allUsers, contract.users, normalisedInput, "user");
  const selectedProjects = selectEntities(allProjects, contract.projects, normalisedInput, "project");
  const mentionedUsers = contract.users.scope === "none"
    ? []
    : selectEntities(allUsers, { scope: "mentions" }, normalisedInput, "user").resolved;
  const mentionedProjects = contract.projects.scope === "none"
    ? []
    : selectEntities(allProjects, { scope: "mentions" }, normalisedInput, "project").resolved;
  const resolvedPhases = resolvePhases(contract.phases, contract.input);
  const resolvedDates = resolveDates(contract.dates, contract.input, options.now ?? new Date());
  const inputMentionMisses = unresolvedInputMentions(
    contract,
    selectedUsers.resolved,
    selectedProjects.resolved,
    disambiguatedUsers.ambiguousAliases,
    disambiguatedProjects.ambiguousAliases,
  );

  let recentMeetingDecisions: ResolvedMeetingDecision[] = [];
  const meetingDecisionMisses: GroundingMiss[] = [];
  if (contract.recentMeetingDecisions.scope === "recent") {
    const projectsMentionedInInput = allProjects.filter((project) =>
      project.aliases.some((alias) => containsAlias(normalisedInput, alias)),
    );
    const broadDecisionIntent = /\b(?:latest|recent)\s+(?:meeting\s+)?decisions?\b|\bwhat (?:was|has been) decided\b/i
      .test(contract.input);
    const requestedProjectIds = contract.recentMeetingDecisions.projectIds !== undefined
      ? [...contract.recentMeetingDecisions.projectIds]
      : (contract.projects.scope === "ids"
          ? selectedProjects.resolved
          : projectsMentionedInInput.length > 0
            ? projectsMentionedInInput
            : broadDecisionIntent
              ? allProjects
              : []
        ).map((project) => project.id);
    const accessibleProjectIds = new Set(allProjects.map((project) => project.id));
    const projectIds = requestedProjectIds.filter((projectId) => accessibleProjectIds.has(projectId));
    meetingDecisionMisses.push(
      ...requestedProjectIds
        .filter((projectId) => !accessibleProjectIds.has(projectId))
        .map((projectId): GroundingMiss => ({
          kind: "meeting-decision",
          reference: projectId,
          reason: "not-found",
        })),
    );
    const memories = await dataSource.listMeetingMemories(projectIds);
    const resolvedDecisions = resolveDecisions(
      memories,
      contract.recentMeetingDecisions.limit,
      selectedUsers.resolved,
    );
    recentMeetingDecisions = resolvedDecisions.decisions;
    meetingDecisionMisses.push(...resolvedDecisions.unresolved);
  }

  return {
    surface: contract.surface,
    resolvedAt: (options.now ?? new Date()).toISOString(),
    users: selectedUsers.resolved,
    projects: selectedProjects.resolved,
    mentionedUserIds: mentionedUsers.map((user) => user.id),
    mentionedProjectIds: mentionedProjects.map((project) => project.id),
    phases: resolvedPhases.phases,
    dates: resolvedDates.dates,
    recentMeetingDecisions,
    unresolved: [
      ...selectedUsers.unresolved,
      ...selectedProjects.unresolved,
      ...resolvedPhases.unresolved,
      ...resolvedDates.unresolved,
      ...inputMentionMisses,
      ...meetingDecisionMisses,
    ],
  };
}

export function serialiseResolvedContext(context: ResolvedContext): string {
  return JSON.stringify(context);
}

function collectTrustedDateValues(value: unknown, output: string[]): void {
  if (typeof value === "string") {
    output.push(...(value.match(/\b\d{4}-\d{2}-\d{2}(?=$|[^0-9])/g) ?? []));
    output.push(...(value.match(/\b\d{1,2}[/.]\d{1,2}[/.]\d{4}(?=$|[^0-9])/g) ?? []));
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectTrustedDateValues(item, output));
    return;
  }
  if (typeof value !== "object" || value === null) return;
  Object.values(value as Record<string, unknown>)
    .forEach((child) => collectTrustedDateValues(child, output));
}

/**
 * Extend a resolved contract only from a successfully authorised tool result.
 * This keeps dates discovered during an agent loop inside the same validator
 * boundary without trusting provider-generated prose.
 */
export function extendGroundingWithTrustedToolResult(
  context: ResolvedContext,
  result: unknown,
  now = new Date(),
): ResolvedContext {
  const values: string[] = [];
  collectTrustedDateValues(result, values);
  if (values.length === 0) return context;

  const discovered = resolveDates({ scope: "values", values }, "", now);
  const dateKeys = new Set(context.dates.map((date) => `${date.source}\u0000${date.isoDate}`));
  const dates = [...context.dates];
  for (const date of discovered.dates) {
    const key = `${date.source}\u0000${date.isoDate}`;
    if (!dateKeys.has(key)) {
      dateKeys.add(key);
      dates.push(date);
    }
  }
  return {
    ...context,
    dates,
    unresolved: [...context.unresolved, ...discovered.unresolved],
  };
}

function equalIdSets(actual: readonly string[], expected: readonly string[]): boolean {
  const actualIds = [...new Set(actual)].sort();
  const expectedIds = [...new Set(expected)].sort();
  return actualIds.length === expectedIds.length &&
    actualIds.every((value, index) => value === expectedIds[index]);
}

/** Confirm a mention-scoped output cites every resolved user and project exactly once or more. */
export function hasExactResolvedEntityIds(
  context: ResolvedContext,
  references: { userIds: readonly string[]; projectIds: readonly string[] },
): boolean {
  return equalIdSets(references.userIds, context.users.map((user) => user.id)) &&
    equalIdSets(references.projectIds, context.projects.map((project) => project.id));
}

export function hasExactResolvedReferences(
  context: ResolvedContext,
  references: {
    userIds: readonly string[];
    projectIds: readonly string[];
    phases: readonly string[];
    dates: readonly string[];
  },
): boolean {
  return hasExactResolvedEntityIds(context, references) &&
    equalIdSets(references.phases, context.phases.map((phase) => phase.value)) &&
    equalIdSets(references.dates, context.dates.map((date) => date.isoDate));
}
