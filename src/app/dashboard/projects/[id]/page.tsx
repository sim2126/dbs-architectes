import { redirect, notFound } from "next/navigation";
import { auth } from "@/platform/auth";
import { prisma } from "@/platform/db";
import {
  authorize,
  loadProjectForAuth,
  logAuthorizationDecision,
  type Subject,
} from "@/platform/authz";
import { ProjectDetailClient, type ProjectDetailData } from "./project-detail-client";

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/login");
  const { id } = await params;

  // Build subject for authorize() + load region access.
  const regions = await prisma.userRegionAccess.findMany({
    where: { userId: session.user.id },
    select: { country: true, operatingRegion: true, accessLevel: true },
  });
  const subject: Subject = {
    userId: session.user.id,
    role: session.user.role,
    regions: regions.map((r) => ({
      country: r.country,
      operatingRegion: r.operatingRegion,
      accessLevel: r.accessLevel as "view" | "manage",
    })),
  };

  // Resolve the project + caller's assignment for the authz decision.
  const resource = await loadProjectForAuth(id, session.user.id);
  if (!resource) notFound();
  const decision = authorize(subject, "project:read", resource);
  await logAuthorizationDecision({
    subject,
    action: "project:read",
    resource,
    decision,
    context: { route: `GET /dashboard/projects/${id}` },
  });
  if (!decision.allow) {
    // 403 surfaces as a clean redirect to the projects list; we don't
    // leak existence of the project to a viewer who can't see it.
    redirect("/dashboard/projects");
  }

  // Fan-out data fetch — all parallel, all server-side, one round-trip
  // budget. None of this travels to the client unless rendered.
  const [project, floorPlans, galleryImages, threadChannel, favorite] = await Promise.all([
    prisma.project.findUnique({
      where: { id },
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
          include: { user: { select: { id: true, name: true, initials: true, image: true } } },
          orderBy: { createdAt: "desc" },
          take: 12,
        },
      },
    }),
    prisma.floorPlan.findMany({
      where: { projectId: id },
      orderBy: { createdAt: "desc" },
      take: 12,
      select: { id: true, title: true, url: true, type: true, year: true, createdAt: true },
    }),
    prisma.galleryImage.findMany({
      where: { projectId: id },
      orderBy: { createdAt: "desc" },
      take: 12,
      select: { id: true, title: true, url: true, thumbnail: true, type: true, year: true, createdAt: true },
    }),
    prisma.channel.findFirst({
      where: { projectId: id, type: "project" },
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
          userId: session.user.id,
          entityType: "project",
          entityId: id,
        },
      },
      select: { id: true },
    }),
  ]);

  if (!project) notFound();

  const data: ProjectDetailData = {
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
        ? { id: a.user.id, name: a.user.name, initials: a.user.initials, image: a.user.image }
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
        ? { id: m.user.id, name: m.user.name, initials: m.user.initials, image: m.user.image }
        : null,
      replies: m.replies.map((r) => ({
        id: r.id,
        content: r.content,
        createdAt: r.createdAt.toISOString(),
        user: r.user
          ? { id: r.user.id, name: r.user.name, initials: r.user.initials, image: r.user.image }
          : null,
      })),
    })),
    starred: favorite !== null,
    currentUserId: session.user.id,
    isAdmin: session.user.role === "admin" || session.user.role === "super_admin",
  };

  return <ProjectDetailClient data={data} />;
}
