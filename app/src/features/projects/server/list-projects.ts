/**
 * listProjects — paginated, filterable read of the project collection.
 *
 * Used by the JSON API at /api/projects (GET). Page server components
 * fetch through their own helpers because they need different joins.
 *
 * Region visibility is enforced here, via `visibleCountries`. It used to
 * say it was — the route carried a comment promising the list was filtered
 * to what the caller may see — while every signed-in user in fact received
 * all 24 projects and discovered the boundary only on clicking one. Titles,
 * clients and communes are not public within the practice, so that was a
 * leak rather than an inconvenience. The caller passes the countries; the
 * rule that produces them is readableProjectCountries() in platform/authz.
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
  /**
   * Countries the caller may see projects in. `null` or omitted means no
   * restriction — pass it explicitly rather than leaving it out by accident.
   */
  visibleCountries?: string[] | null;
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
    visibleCountries = null,
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
        // A project with no country belongs to the whole practice.
        visibleCountries
          ? { OR: [{ country: null }, { country: { in: visibleCountries } }] }
          : {},
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
