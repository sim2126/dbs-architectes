/**
 * updateProject — patch a project + emit an activity row.
 *
 * Authorization is the route's concern. The route picks between the
 * narrow "project:update.status" action (workStatus-only) and the
 * broad "project:update" before calling this function; once we're
 * here, the changes are applied as supplied.
 */

import { prisma } from "@/platform/db";
import { normaliseProjectPhase } from "../domain/phase-helpers";

export type UpdateProjectInput = {
  projectId: string;
  actorUserId: string;
  data: {
    title?: string;
    phase?: string;
    category?: string;
    client?: string | null;
    year?: number | null;
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
  const phase = data.phase?.trim() ? normaliseProjectPhase(data.phase) : undefined;

  const project = await prisma.project.update({
    where: { id: projectId },
    data: {
      ...(data.title       && { title: data.title }),
      ...(phase            && { phase }),
      ...(data.category    && { category: data.category }),
      ...(data.client      !== undefined && { client: data.client }),
      ...(data.year        !== undefined && { year: data.year }),
      ...(data.commune     !== undefined && { commune: data.commune }),
      ...(data.typology    !== undefined && { typology: data.typology }),
      ...(data.terrain     !== undefined && { terrain: data.terrain }),
      ...(data.roof        !== undefined && { roof: data.roof }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.notes       !== undefined && { notes: data.notes }),
      ...(data.billing     !== undefined && { billing: data.billing }),
      ...(data.image       !== undefined && { image: data.image }),
      ...(data.workStatus  !== undefined && { workStatus: data.workStatus }),
      // An empty cell clears the date; a value arrives as an ISO day string
      // from the board's date input.
      ...(data.startDate   !== undefined && {
        startDate: data.startDate ? new Date(data.startDate) : null,
      }),
      ...(data.endDate     !== undefined && {
        endDate: data.endDate ? new Date(data.endDate) : null,
      }),
      ...(data.address     !== undefined && { address: data.address }),
      ...(data.latitude    !== undefined && {
        latitude: data.latitude != null ? parseFloat(String(data.latitude)) : null,
      }),
      ...(data.longitude   !== undefined && {
        longitude: data.longitude != null ? parseFloat(String(data.longitude)) : null,
      }),
    },
  });

  await prisma.activity.create({
    data: {
      type: "updated",
      description: `Progetto "${project.title}" aggiornato`,
      projectId: project.id,
      userId: actorUserId,
    },
  });

  return project;
}
