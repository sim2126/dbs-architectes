import { auth } from "@/platform/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/platform/db";
import { parseProjectPageQuery, ProjectsExplorer } from "@/features/projects";

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const initialQuery = parseProjectPageQuery(await searchParams);
  const session = await auth({ allowExternal: true });
  if (!session) redirect("/login");
  if (session.user.isExternal) redirect("/dashboard/chat");

  const [projects, users] = await Promise.all([
    prisma.project.findMany({
      orderBy: { updatedAt: "desc" },
      include: {
        assignments: {
          include: { user: { select: { id: true, name: true, initials: true, image: true } } },
        },
      },
    }),
    prisma.user.findMany({
      where: { isActive: true, isExternal: false },
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
    <ProjectsExplorer
      initialProjects={projects.map((p) => ({
        ...p,
        workStatus: p.workStatus ?? "todo",
        createdAt: p.createdAt.toISOString(),
        updatedAt: p.updatedAt.toISOString(),
        assignments: p.assignments.map((a) => ({
          userId: a.userId,
          role: a.role ?? null,
          user: {
            id: a.user.id,
            name: a.user.name,
            initials: a.user.initials,
            image: a.user.image ?? null,
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
      currentUserId={session.user.id}
      initialQuery={initialQuery}
    />
  );
}
