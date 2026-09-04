/**
 * listProjects — paginated, filterable read of the project collection.
 *
 * Used by the JSON API at /api/projects (GET). Page server components
 * fetch through their own helpers because they need different joins.
 *
 * No authorization is enforced here — the caller must have a session
 * (the list endpoint is firm-wide visible to any signed-in user; finer
 * regional filtering is applied via the `country` / `operatingRegion`
 * filters and the WHERE clause).
 */

import { prisma } from "@/platform/db";
import { normaliseProjectPhase } from "../domain/phase-helpers";

export type ListProjectsInput = {
  search?: string;
  phase?: string;
  category?: string;
  country?: string;
  operatingRegion?: string;
  cursor?: string;
  /** Page size. Defaulted + clamped by the caller. */
  limit: number;
};

export type ListProjectsOutput = {
  projects: Awaited<ReturnType<typeof fetchProjectsPage>>["projects"];
  hasMore: boolean;
  nextCursor: string | null;
};

async function fetchProjectsPage(input: ListProjectsInput) {
  const {
    search = "",
    phase = "",
    category = "",
    country = "",
    operatingRegion = "",
    cursor = "",
    limit,
  } = input;
  const normalisedPhase = phase ? normaliseProjectPhase(phase) : "";

  const projects = await prisma.project.findMany({
    where: {
      AND: [
        search
          ? {
              OR: [
                { title:   { contains: search, mode: "insensitive" } },
                { code:    { contains: search, mode: "insensitive" } },
                { client:  { contains: search, mode: "insensitive" } },
                { commune: { contains: search, mode: "insensitive" } },
              ],
            }
          : {},
        normalisedPhase ? { phase: normalisedPhase }    : {},
        category        ? { category }                  : {},
        country         ? { country }                   : {},
        operatingRegion ? { operatingRegion }           : {},
      ],
    },
    orderBy: { updatedAt: "desc" },
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    take: limit + 1,
    include: {
      assignments: {
        include: { user: { select: { id: true, name: true, initials: true } } },
      },
      // How much has been said about this project. The board shows it on the
      // row so you can see where the conversation is, which is half the
      // reason to look at a board in the morning. Counted through the
      // relation rather than per row, and deleted messages do not count.
      channels: {
        select: { _count: { select: { messages: { where: { deletedAt: null } } } } },
      },
    },
  });

  return {
    projects: projects.map(({ channels, ...project }) => ({
      ...project,
      updateCount: channels.reduce((sum, channel) => sum + channel._count.messages, 0),
    })),
  };
}

export async function listProjects(input: ListProjectsInput): Promise<ListProjectsOutput> {
  const { projects } = await fetchProjectsPage(input);
  const hasMore = projects.length > input.limit;
  const page = hasMore ? projects.slice(0, input.limit) : projects;
  const nextCursor = hasMore ? page.at(-1)?.id ?? null : null;
  return { projects: page, hasMore, nextCursor };
}
