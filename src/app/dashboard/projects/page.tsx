import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ProjectsClient, type ProjectRow } from "./projects-client";

export default async function ProjectsPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const userId = session.user.id;

  const [projects, favorites] = await Promise.all([
    prisma.project.findMany({
      orderBy: { updatedAt: "desc" },
      include: {
        assignments: {
          include: {
            user: {
              select: { id: true, name: true, initials: true },
            },
          },
        },
      },
    }),
    prisma.favorite.findMany({
      where: { userId, entityType: "project" },
      select: { entityId: true },
    }),
  ]);

  const starredIds = new Set(favorites.map((f) => f.entityId));

  const initialProjects: ProjectRow[] = projects.map((p) => {
    // Lead = assignment with role "lead" or first assignment.
    const leadAssignment =
      p.assignments.find(
        (a) => a.role && a.role.toLowerCase().includes("lead"),
      ) ?? p.assignments[0];

    return {
      id: p.id,
      code: p.code,
      title: p.title,
      phase: p.phase,
      workStatus: p.workStatus,
      country: p.country,
      year: p.year,
      commune: p.commune,
      image: p.image,
      updatedAt: p.updatedAt.toISOString(),
      starred: starredIds.has(p.id),
      lead: leadAssignment
        ? {
            initials: leadAssignment.user.initials ?? "?",
            name: leadAssignment.user.name ?? leadAssignment.user.initials ?? "Lead",
          }
        : null,
      team: p.assignments.map((a) => ({
        initials: a.user.initials ?? "?",
        name: a.user.name ?? a.user.initials ?? "Member",
      })),
    };
  });

  const canEdit =
    session.user.role === "super_admin" ||
    session.user.role === "admin" ||
    session.user.role === "project_manager" ||
    session.user.role === "director" ||
    session.user.role === "manager";

  return <ProjectsClient initialProjects={initialProjects} canEdit={canEdit} />;
}
