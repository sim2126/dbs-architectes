import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { DashboardClient } from "./dashboard-client";

export default async function DashboardPage() {
  const session = await auth();

  const [projectCount, userCount, phaseStats, workStatusStats, recentActivity, upcomingAgenda] = await Promise.all([
    prisma.project.count(),
    prisma.user.count({ where: { isActive: true } }),
    prisma.project.groupBy({
      by: ["phase"],
      _count: { phase: true },
    }),
    prisma.project.groupBy({
      by: ["workStatus"],
      _count: { workStatus: true },
    }),
    prisma.activity.findMany({
      take: 8,
      orderBy: { createdAt: "desc" },
      include: { user: true, project: true },
    }),
    prisma.agendaItem.findMany({
      take: 5,
      where: {
        date: { gte: new Date() },
        status: { not: "done" },
      },
      orderBy: { date: "asc" },
      include: { project: true },
    }),
  ]);

  const [assignedCount, activeProjects, blockedProjects] = await Promise.all([
    prisma.project.count({
      where: {
        assignments: {
          some: { userId: { not: undefined } },
        },
      },
    }),
    prisma.project.count({
      where: {
        phase: {
          notIn: ["TERMINATO", "STUCK"],
        },
      },
    }),
    prisma.project.count({
      where: {
        phase: "STUCK",
      },
    }),
  ]);

  const unassignedCount = projectCount - assignedCount;

  return (
    <DashboardClient
      user={session!.user}
      stats={{
        projectCount,
        activeProjects,
        userCount,
        assignedCount,
        unassignedCount,
        blockedProjects,
        phaseStats: phaseStats.map((s) => ({
          phase: s.phase,
          count: s._count.phase,
        })),
        workStatusStats: workStatusStats.map((s) => ({
          status: s.workStatus ?? "todo",
          count: s._count.workStatus,
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
      upcomingAgenda={upcomingAgenda.map((item) => ({
        id: item.id,
        title: item.title,
        date: item.date.toISOString(),
        priority: item.priority,
        project: item.project ? { title: item.project.title, code: item.project.code } : null,
      }))}
    />
  );
}
