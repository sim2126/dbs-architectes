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
  "director",
  "manager",
  "project_manager",
]);

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
        status: "active",
        ...(WORKSPACE_PROJECT_ROLES.has(subject.role)
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

function resolvePhases(need: PhaseResolutionNeed, input: string): ResolvedPhase[] {
  if (need.scope === "none") return [];
  const values = need.scope === "values" ? need.values : CANONICAL_PHASES;
  const compactInput = input.toUpperCase().replace(/\s*\/\s*/g, "/");
  return unique(values.map((value) => value.trim().replace(/\s*\/\s*/g, "/").toUpperCase()))
    .filter((value) => need.scope === "values" || compactInput.includes(value))
    .map((value) => ({
      kind: "phase" as const,
      value,
      aliases: unique([value, value.replaceAll("/", " / ")]),
    }));
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
): ResolvedMeetingDecision[] {
  const decisions = memories.flatMap((memory) => {
    if (!Array.isArray(memory.keyDecisions)) return [];
    return memory.keyDecisions.flatMap((item): ResolvedMeetingDecision[] => {
      if (!item || typeof item !== "object") return [];
      const decision = item as Record<string, unknown>;
      const text = typeof decision.what === "string" ? decision.what.trim() : "";
      if (!text) return [];
      return [{
        kind: "meeting-decision",
        memoryId: memory.id,
        projectId: memory.projectId,
        text,
        decidedBy: typeof decision.who === "string" ? decision.who : null,
        decidedAt:
          typeof decision.at === "string" ? decision.at : memory.updatedAt.toISOString(),
      }];
    });
  });
  return decisions
    .sort((a, b) => (b.decidedAt ?? "").localeCompare(a.decidedAt ?? ""))
    .slice(0, Math.max(0, limit));
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

  const allUsers: ResolvedUser[] = userRows.map((row) => ({
    kind: "user",
    id: row.id,
    name: row.name?.trim() || row.email,
    email: row.email,
    aliases: userAliases(row, uniqueFirstNames),
  }));
  const allProjects: ResolvedProject[] = projectRows.map((row) => ({
    kind: "project",
    id: row.id,
    code: row.code,
    title: row.title,
    phase: row.phase,
    client: row.client,
    commune: row.commune,
    aliases: unique([row.code, row.title]),
  }));

  const normalisedInput = normalise(contract.input);
  const selectedUsers = selectEntities(allUsers, contract.users, normalisedInput, "user");
  const selectedProjects = selectEntities(allProjects, contract.projects, normalisedInput, "project");
  const resolvedDates = resolveDates(contract.dates, contract.input, options.now ?? new Date());

  let recentMeetingDecisions: ResolvedMeetingDecision[] = [];
  const meetingDecisionMisses: GroundingMiss[] = [];
  if (contract.recentMeetingDecisions.scope === "recent") {
    const projectsMentionedInInput = allProjects.filter((project) =>
      project.aliases.some((alias) => containsAlias(normalisedInput, alias)),
    );
    const requestedProjectIds = contract.recentMeetingDecisions.projectIds !== undefined
      ? [...contract.recentMeetingDecisions.projectIds]
      : (contract.projects.scope === "ids"
          ? selectedProjects.resolved
          : projectsMentionedInInput
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
    recentMeetingDecisions = resolveDecisions(memories, contract.recentMeetingDecisions.limit);
  }

  return {
    surface: contract.surface,
    resolvedAt: (options.now ?? new Date()).toISOString(),
    users: selectedUsers.resolved,
    projects: selectedProjects.resolved,
    phases: resolvePhases(contract.phases, contract.input),
    dates: resolvedDates.dates,
    recentMeetingDecisions,
    unresolved: [
      ...selectedUsers.unresolved,
      ...selectedProjects.unresolved,
      ...resolvedDates.unresolved,
      ...meetingDecisionMisses,
    ],
  };
}

export function serialiseResolvedContext(context: ResolvedContext): string {
  return JSON.stringify(context);
}
