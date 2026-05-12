/**
 * createProject — insert a project + emit an activity row.
 *
 * Caller is responsible for authorization (`project:create` via
 * requirePermission) and for passing a clean `actorUserId` (used as
 * the activity author).
 */

import { prisma } from "@/platform/db";

export type CreateProjectInput = {
  actorUserId: string;
  data: {
    code: string;
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

export async function createProject(input: CreateProjectInput) {
  const { actorUserId, data } = input;

  const project = await prisma.project.create({
    data: {
      code:            data.code,
      title:           data.title,
      category:        data.category        || "Residenziale",
      phase:           data.phase           || "ETUDE / AP",
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
