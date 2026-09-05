/**
 * updateProject — patch a project + emit an activity row.
 *
 * Authorization is the route's concern. The route picks between the
 * narrow "project:update.status" action (workStatus-only) and the
 * broad "project:update" before calling this function; once we're
 * here, the changes are applied as supplied.
 */

import { prisma } from "@/platform/db";
import { Prisma } from "@prisma/client";
import { normaliseProjectPhase } from "../domain/phase-helpers";
import {
  parseProjectCoordinate, parseProjectDate, parseProjectYear, ProjectInputError,
  validateProjectDateRange, validateProjectValues,
} from "../domain/project-input";

export type UpdateProjectInput = {
  projectId: string;
  actorUserId: string;
  data: {
    title?: string;
    phase?: string;
    category?: string;
    client?: string | null;
    year?: number | string | null;
    commune?: string | null;
    typology?: string | null;
    terrain?: string | null;
    roof?: string | null;
    description?: string | null;
    notes?: string | null;
    billing?: string | null;
    image?: string | null;
    workStatus?: string;
    startDate?: string | Date | null;
    endDate?: string | Date | null;
    address?: string | null;
    latitude?: number | string | null;
    longitude?: number | string | null;
  };
};

export async function updateProject(input: UpdateProjectInput) {
  const { projectId, actorUserId, data } = input;
  validateProjectValues(data);
  const phase = data.phase?.trim() ? normaliseProjectPhase(data.phase) : undefined;
  const startDate = data.startDate === undefined ? undefined : parseProjectDate(data.startDate, "Start date");
  const endDate = data.endDate === undefined ? undefined : parseProjectDate(data.endDate, "End date");
  const year = data.year === undefined ? undefined : parseProjectYear(data.year);
  const latitude = data.latitude === undefined ? undefined : parseProjectCoordinate(data.latitude, "latitude");
  const longitude = data.longitude === undefined ? undefined : parseProjectCoordinate(data.longitude, "longitude");

  return prisma.$transaction(async (tx) => {
  if (startDate !== undefined || endDate !== undefined) {
    // Lock the row before reading the other endpoint, so concurrent edits
    // to different date cells cannot jointly persist a reversed range.
    const existing = await tx.$queryRaw<{ startDate: Date | null; endDate: Date | null }[]>(
      Prisma.sql`SELECT "startDate", "endDate" FROM "Project" WHERE id = ${projectId} FOR UPDATE`,
    );
    if (!existing[0]) throw new ProjectInputError("Project not found.", 404);
    validateProjectDateRange(
      startDate === undefined ? existing[0].startDate : startDate,
      endDate === undefined ? existing[0].endDate : endDate,
    );
  }

  const project = await tx.project.update({
    where: { id: projectId },
    data: {
      ...(data.title       && { title: data.title }),
      ...(phase            && { phase }),
      ...(data.category    && { category: data.category }),
      ...(data.client      !== undefined && { client: data.client }),
      ...(year             !== undefined && { year }),
      ...(data.commune     !== undefined && { commune: data.commune }),
      ...(data.typology    !== undefined && { typology: data.typology }),
      ...(data.terrain     !== undefined && { terrain: data.terrain }),
      ...(data.roof        !== undefined && { roof: data.roof }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.notes       !== undefined && { notes: data.notes }),
      ...(data.billing     !== undefined && { billing: data.billing }),
      ...(data.image       !== undefined && { image: data.image }),
      ...(data.workStatus  !== undefined && { workStatus: data.workStatus }),
      ...(startDate        !== undefined && { startDate }),
      ...(endDate          !== undefined && { endDate }),
      ...(data.address     !== undefined && { address: data.address }),
      ...(latitude         !== undefined && { latitude }),
      ...(longitude        !== undefined && { longitude }),
    },
  });

  await tx.activity.create({
    data: {
      type: "updated",
      description: `Progetto "${project.title}" aggiornato`,
      projectId: project.id,
      userId: actorUserId,
    },
  });

  return project;
  }, { maxWait: 10_000, timeout: 10_000 });
}
