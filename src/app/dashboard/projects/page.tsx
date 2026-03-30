import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ProjectsClient } from "./projects-client";

export default async function ProjectsPage() {
  const session = await auth();

  const [projects, users] = await Promise.all([
    prisma.project.findMany({
      orderBy: { updatedAt: "desc" },
      include: {
        assignments: {
          include: { user: true },
        },
      },
    }),
    prisma.user.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const canCreate =
    session?.user.role === "super_admin" ||
    session?.user.role === "admin" ||
    session?.user.role === "project_manager";

  const canEdit =
    session?.user.role === "super_admin" ||
    session?.user.role === "admin" ||
    session?.user.role === "project_manager";

  const canDelete =
    session?.user.role === "super_admin" || session?.user.role === "admin";

  return (
    <ProjectsClient
      initialProjects={projects.map((p) => ({
        ...p,
        createdAt: p.createdAt.toISOString(),
        updatedAt: p.updatedAt.toISOString(),
        assignments: p.assignments.map((a) => ({
          userId: a.userId,
          user: {
            id: a.user.id,
            name: a.user.name,
            initials: a.user.initials,
          },
        })),
      }))}
      users={users.map((u) => ({
        id: u.id,
        name: u.name,
        initials: u.initials,
        email: u.email,
        role: u.role,
      }))}
      permissions={{ canCreate, canEdit, canDelete }}
      currentUserId={session!.user.id}
    />
  );
}
