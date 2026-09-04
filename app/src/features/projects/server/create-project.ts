/**
 * createProject — insert a project + emit an activity row.
 *
 * Caller is responsible for authorization (`project:create` via
 * requirePermission) and for passing a clean `actorUserId` (used as
 * the activity author).
 */

import { prisma } from "@/platform/db";
import { DEFAULT_PROJECT_PHASE, normaliseProjectPhase } from "../domain/phase-helpers";
import { nextProjectCode } from "../domain/next-project-code";

export type CreateProjectInput = {
  actorUserId: string;
  data: {
    /** Omitted by the board's add-item, which asks only for a name. */
    code?: string;
    title: string;
    category?: string;
    phase?: string;
    client?: string | null;
    year?: number | string | null;
    commune?: string | null;
    typology?: string | null;
    terrain?: string | null;
    roof?: string | null;
    description?: string | null;
    pageLink?: string | null;
    image?: string | null;
    country?: string | null;
    operatingRegion?: string | null;
    regionCode?: string | null;
    address?: string | null;
    latitude?: number | string | null;
    longitude?: number | string | null;
  };
};

/**
 * Allocate the next code for this year.
 *
 * Two people adding a project at the same moment can compute the same
 * number, so the unique index on `code` is the real arbiter and a collision
 * is retried rather than surfaced. Three attempts is generous: each retry
 * re-reads the year's codes, so it only loses if it keeps tying.
 */
async function allocateCode(): Promise<string> {
  const year = new Date().getFullYear();
  const taken = await prisma.project.findMany({
    where: { code: { startsWith: `DBS-${year}-` } },
    select: { code: true },
  });
  return nextProjectCode(year, taken.map((p) => p.code));
}

function isCodeCollision(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: string }).code === "P2002"
  );
}

export async function createProject(input: CreateProjectInput) {
  const { actorUserId, data } = input;

  const project = await createRow(data, data.code?.trim() || (await allocateCode()));

  await prisma.activity.create({
    data: {
      type: "created",
      description: `Progetto "${project.title}" creato`,
      projectId: project.id,
      userId: actorUserId,
    },
  });

  return project;
}

async function createRow(data: CreateProjectInput["data"], code: string) {
  const attempts = data.code?.trim() ? 1 : 3;
  for (let attempt = 1; ; attempt++) {
    try {
      return await insert(data, attempt === 1 ? code : await allocateCode());
    } catch (error) {
      if (attempt >= attempts || !isCodeCollision(error)) throw error;
    }
  }
}

function insert(data: CreateProjectInput["data"], code: string) {
  return prisma.project.create({
    data: {
      code,
      title:           data.title,
      category:        data.category        || "Residenziale",
      phase:           data.phase?.trim() ? normaliseProjectPhase(data.phase) : DEFAULT_PROJECT_PHASE,
      client:          data.client          || null,
      year:            data.year            ? parseInt(String(data.year)) : null,
      commune:         data.commune         || null,
      typology:        data.typology        || null,
      terrain:         data.terrain         || null,
      roof:            data.roof            || null,
      description:     data.description     || null,
      pageLink:        data.pageLink        || null,
      image:           data.image           || null,
      country:         data.country         || null,
      operatingRegion: data.operatingRegion || null,
      regionCode:      data.regionCode      || null,
      address:         data.address         || null,
      latitude:        data.latitude        != null ? parseFloat(String(data.latitude))  : null,
      longitude:       data.longitude       != null ? parseFloat(String(data.longitude)) : null,
    },
    include: {
      assignments: {
        include: { user: { select: { id: true, name: true, initials: true } } },
      },
    },
  });
}
