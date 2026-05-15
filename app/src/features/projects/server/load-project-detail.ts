/**
 * loadProjectDetail — single server-side fan-out for the project
 * detail screen.
 *
 * Used by:
 *   - app/dashboard/projects/[id]/page.tsx (server component)
 *   - app/api/projects/[id]/route.ts       (GET — when JSON wire shape is needed)
 *
 * Loads: project core, assignments + users, agenda (open first), recent
 * activity, files (FloorPlan + GalleryImage merged), the project's
 * thread channel (last few top-level messages + replies), and the
 * caller's Favorite row for the star button state.
 *
 * Returns null if the project doesn't exist (caller's job to 404).
 *
 * This function does NOT enforce authorization — the caller must have
 * already cleared `project:read` via requirePermission(). Server code
 * trusts its caller.
 */

import { prisma } from "@/platform/db";
import type { ProjectDetailData } from "../domain/types";

export type LoadProjectDetailInput = {
  projectId: string;
  currentUserId: string;
  isAdmin: boolean;
  canAssignMembers: boolean;
};

export async function loadProjectDetail(
  input: LoadProjectDetailInput,
): Promise<ProjectDetailData | null> {
  const { projectId, currentUserId, isAdmin, canAssignMembers } = input;

  const [project, floorPlans, galleryImages, threadChannel, favorite] =
    await Promise.all([
      prisma.project.findUnique({
        where: { id: projectId },
        include: {
          assignments: {
            include: {
              user: {
                select: {
                  id: true, name: true, email: true,
                  initials: true, image: true, role: true,
                },
              },
            },
          },
          agendaItems: {
            orderBy: [{ status: "asc" }, { date: "asc" }],
            take: 30,
            select: {
              id: true, title: true, date: true, status: true,
              priority: true, type: true,
            },
          },
          activities: {
            include: {
              user: { select: { id: true, name: true, initials: true, image: true } },
            },
            orderBy: { createdAt: "desc" },
            take: 12,
          },
        },
      }),
      prisma.floorPlan.findMany({
        where: { projectId },
        orderBy: { createdAt: "desc" },
        take: 12,
        select: { id: true, title: true, url: true, type: true, year: true, createdAt: true },
      }),
      prisma.galleryImage.findMany({
        where: { projectId },
        orderBy: { createdAt: "desc" },
        take: 12,
        select: { id: true, title: true, url: true, thumbnail: true, type: true, year: true, createdAt: true },
      }),
      prisma.channel.findFirst({
        where: { projectId, type: "project" },
        select: {
          id: true,
          messages: {
            where: { deletedAt: null, parentId: null },
            orderBy: { createdAt: "desc" },
            take: 3,
            include: {
              user: { select: { id: true, name: true, initials: true, image: true } },
              replies: {
                where: { deletedAt: null },
                orderBy: { createdAt: "asc" },
                take: 10,
                include: {
                  user: { select: { id: true, name: true, initials: true, image: true } },
                },
              },
            },
          },
        },
      }),
      prisma.favorite.findUnique({
        where: {
          userId_entityType_entityId: {
            userId: currentUserId,
            entityType: "project",
            entityId: projectId,
          },
        },
        select: { id: true },
      }),
    ]);

  if (!project) return null;

  return {
    project: {
      id: project.id,
      code: project.code,
      title: project.title,
      phase: project.phase,
      workStatus: project.workStatus,
      category: project.category,
      client: project.client,
      year: project.year,
      commune: project.commune,
      typology: project.typology,
      terrain: project.terrain,
      roof: project.roof,
      description: project.description,
      image: project.image,
      floors: project.floors,
      area: project.area,
      billing: project.billing,
      country: project.country,
      operatingRegion: project.operatingRegion,
      address: project.address,
      latitude: project.latitude,
      longitude: project.longitude,
      pageLink: project.pageLink,
      updatedAt: project.updatedAt.toISOString(),
    },
    assignments: project.assignments.map((a) => ({
      userId: a.userId,
      role: a.role,
      user: {
        id: a.user.id,
        name: a.user.name,
        email: a.user.email,
        initials: a.user.initials,
        image: a.user.image,
        role: a.user.role,
      },
    })),
    agenda: project.agendaItems.map((a) => ({
      id: a.id,
      title: a.title,
      date: a.date.toISOString(),
      status: a.status,
      priority: a.priority,
      type: a.type,
    })),
    activities: project.activities.map((a) => ({
      id: a.id,
      type: a.type,
      description: a.description,
      createdAt: a.createdAt.toISOString(),
      user: a.user
        ? {
            id: a.user.id,
            name: a.user.name,
            initials: a.user.initials,
            image: a.user.image,
          }
        : null,
    })),
    files: [
      ...floorPlans.map((f) => ({
        id: f.id,
        kind: "plan" as const,
        title: f.title ?? "Plan",
        url: f.url,
        type: f.type,
        year: f.year,
        createdAt: f.createdAt.toISOString(),
      })),
      ...galleryImages.map((g) => ({
        id: g.id,
        kind: "image" as const,
        title: g.title ?? "Image",
        url: g.thumbnail ?? g.url,
        type: g.type,
        year: g.year,
        createdAt: g.createdAt.toISOString(),
      })),
    ].slice(0, 16),
    threads: (threadChannel?.messages ?? []).map((m) => ({
      id: m.id,
      content: m.content,
      createdAt: m.createdAt.toISOString(),
      user: m.user
        ? {
            id: m.user.id,
            name: m.user.name,
            initials: m.user.initials,
            image: m.user.image,
          }
        : null,
      replies: m.replies.map((r) => ({
        id: r.id,
        content: r.content,
        createdAt: r.createdAt.toISOString(),
        user: r.user
          ? {
              id: r.user.id,
              name: r.user.name,
              initials: r.user.initials,
              image: r.user.image,
            }
          : null,
      })),
    })),
    starred: favorite !== null,
    currentUserId,
    isAdmin,
    canAssignMembers,
  };
}
