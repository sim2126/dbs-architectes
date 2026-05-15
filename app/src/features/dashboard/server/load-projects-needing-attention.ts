/**
 * loadProjectsNeedingAttention — what the PM dashboard widget asks at
 * load time: which active projects look like they need a manager's
 * eye right now?
 *
 * A project lands in the list when ANY of these hold:
 *   - latest status update is "off_track"          → severity "off_track"
 *   - latest status update is "at_risk"            → severity "at_risk"
 *   - latest status update is older than `staleDays` → severity "stale"
 *   - project never had a status update            → severity "silent"
 *
 * Terminal phases (TERMINATO / CANCELLED / ARCHIVED) are excluded —
 * a finished project shouldn't keep nagging.
 *
 * Scoping:
 *   - admin / director: all projects firm-wide
 *   - lead (manager / project_manager): only projects they're
 *     assigned to (passed in as `scopedProjectIds`)
 *
 * Authorization is the caller's concern. This function trusts that
 * the page has already gated by manager-or-above.
 */

import { prisma } from "@/platform/db";

export type AttentionSeverity = "off_track" | "at_risk" | "stale" | "silent";

export type AttentionRow = {
  projectId: string;
  code: string;
  title: string;
  phase: string;
  workStatus: string;
  severity: AttentionSeverity;
  /** Days since the most recent status update; `null` if there is none. */
  daysSinceStatus: number | null;
  /** Last status update author display info, if any. */
  lastAuthor: { name: string | null; initials: string | null } | null;
  /** Most recent status summary, truncated; `null` if no status yet. */
  lastSummary: string | null;
};

export type LoadAttentionInput = {
  /** Restricts to this set of project IDs. Pass `null` for firm-wide. */
  scopedProjectIds: string[] | null;
  staleDays?: number;
  limit?: number;
};

// Order projects by how loud the alarm is. Inside a severity, more days
// since status → higher up.
const SEVERITY_ORDER: Record<AttentionSeverity, number> = {
  off_track: 0,
  at_risk: 1,
  silent: 2,
  stale: 3,
};

const TERMINAL_PHASES = ["TERMINATO", "CANCELLED", "ARCHIVED"];

export async function loadProjectsNeedingAttention(
  input: LoadAttentionInput,
): Promise<AttentionRow[]> {
  const staleDays = input.staleDays ?? 14;
  const limit = input.limit ?? 12;

  // Empty scoped set → caller can see nothing. Return early instead of
  // running a query whose result is guaranteed empty.
  if (input.scopedProjectIds !== null && input.scopedProjectIds.length === 0) {
    return [];
  }

  type ProjectRow = {
    id: string;
    code: string;
    title: string;
    phase: string;
    workStatus: string;
  };

  const where = {
    phase: { notIn: TERMINAL_PHASES },
    ...(input.scopedProjectIds !== null
      ? { id: { in: input.scopedProjectIds } }
      : {}),
  };

  const projects = (await prisma.project.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      code: true,
      title: true,
      phase: true,
      workStatus: true,
    },
  })) as ProjectRow[];

  if (projects.length === 0) return [];

  type StatusRow = {
    projectId: string;
    health: string;
    summary: string;
    createdAt: Date;
    author: { name: string | null; initials: string | null };
  };

  // Pull every status update for the candidate projects, ordered DESC
  // so the first occurrence per projectId is the latest. With ~50 active
  // projects × small history this is cheap; if it ever gets big we'd
  // switch to a DISTINCT ON (projectId) query.
  const statusRows = (await prisma.projectStatusUpdate.findMany({
    where: { projectId: { in: projects.map((p) => p.id) } },
    orderBy: { createdAt: "desc" },
    select: {
      projectId: true,
      health: true,
      summary: true,
      createdAt: true,
      author: { select: { name: true, initials: true } },
    },
  })) as StatusRow[];

  const latestByProject = new Map<string, StatusRow>();
  for (const s of statusRows) {
    if (latestByProject.has(s.projectId)) continue;
    latestByProject.set(s.projectId, s);
  }

  const now = Date.now();
  const staleMs = staleDays * 24 * 60 * 60 * 1000;
  const rows: AttentionRow[] = [];

  for (const p of projects) {
    const last = latestByProject.get(p.id);
    let severity: AttentionSeverity | null = null;
    let daysSince: number | null = null;
    let lastSummary: string | null = null;
    let lastAuthor: AttentionRow["lastAuthor"] = null;

    if (!last) {
      severity = "silent";
    } else {
      const ageMs = now - last.createdAt.getTime();
      daysSince = Math.floor(ageMs / (24 * 60 * 60 * 1000));
      lastSummary = last.summary.length > 240
        ? `${last.summary.slice(0, 237)}…`
        : last.summary;
      lastAuthor = last.author;
      if (last.health === "off_track") severity = "off_track";
      else if (last.health === "at_risk") severity = "at_risk";
      else if (ageMs > staleMs) severity = "stale";
    }

    if (severity === null) continue;
    rows.push({
      projectId: p.id,
      code: p.code,
      title: p.title,
      phase: p.phase,
      workStatus: p.workStatus,
      severity,
      daysSinceStatus: daysSince,
      lastAuthor,
      lastSummary,
    });
  }

  rows.sort((a, b) => {
    const so = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    if (so !== 0) return so;
    // Inside same severity: oldest-status first (most overdue at top).
    const ad = a.daysSinceStatus ?? Number.POSITIVE_INFINITY;
    const bd = b.daysSinceStatus ?? Number.POSITIVE_INFINITY;
    return bd - ad;
  });

  return rows.slice(0, limit);
}
