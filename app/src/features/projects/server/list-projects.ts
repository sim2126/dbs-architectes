/**
 * listProjects — paginated, filterable read of the project collection.
 *
 * Used by the JSON API at /api/projects (GET). Page server components
 * fetch through their own helpers because they need different joins.
 *
 * A live Subject is required so query-time visibility includes permission
 * denials, countries and operating regions, just like project:read.
 */

import { prisma } from "@/platform/db";
import { projectReadWhere, type Subject } from "@/platform/authz";
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
  subject: Subject;
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
    subject,
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
        projectReadWhere(subject),
        // The immutable key remains a valid boundary even if the previous
        // page's last row is edited or deleted before the next request.
        cursor ? { id: { gt: cursor } } : {},
      ],
    },
    orderBy: { id: "asc" },
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
