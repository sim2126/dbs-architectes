import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { DashboardClient } from "./dashboard-client";

export default async function DashboardPage() {
  const session = await auth();

  const [projectCount, userCount, phaseStats, recentActivity] = await Promise.all([
    prisma.project.count(),
    prisma.user.count({ where: { isActive: true } }),
    prisma.project.groupBy({
      by: ["phase"],
      _count: { phase: true },
    }),
    prisma.activity.findMany({
      take: 8,
      orderBy: { createdAt: "desc" },
      include: { user: true, project: true },
    }),
  ]);

  const assignedCount = await prisma.project.count({
    where: {
      assignments: {
        some: { userId: { not: undefined } },
      },
    },
  });

  const unassignedCount = projectCount - assignedCount;

  return (
    <DashboardClient
      user={session!.user}
      stats={{
        projectCount,
        userCount,
        assignedCount,
        unassignedCount,
        phaseStats: phaseStats.map((s) => ({
          phase: s.phase,
          count: s._count.phase,
        })),
      }}
      recentActivity={recentActivity.map((a) => ({
        id: a.id,
        type: a.type,
        description: a.description,
        createdAt: a.createdAt.toISOString(),
        user: a.user ? { name: a.user.name, initials: a.user.initials } : null,
        project: a.project ? { title: a.project.title, code: a.project.code } : null,
      }))}
    />
  );
}
