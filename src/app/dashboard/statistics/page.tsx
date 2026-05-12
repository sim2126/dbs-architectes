import { prisma } from "@/platform/db";
import { StatisticsClient } from "@/features/statistics";

export default async function StatisticsPage() {
  const [rawProjects, rawUsers] = await Promise.all([
    prisma.project.findMany({
      select: {
        id: true,
        phase: true,
        category: true,
        country: true,
        assignments: {
          select: { userId: true },
        },
      },
    }),
    prisma.user.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        initials: true,
        defaultCountry: true,
      },
    }),
  ]);

  // Shape for client
  const projects = rawProjects.map((p) => ({
    id: p.id,
    phase: p.phase,
    category: p.category,
    country: p.country,
    userIds: p.assignments.map((a) => a.userId),
  }));
  const users = rawUsers.map((u) => ({
    id: u.id,
    name: u.name ?? "Unknown",
    initials: u.initials ?? u.name?.split(" ").map((n) => n[0]).join("") ?? "??",
    country: u.defaultCountry,
  }));

  return <StatisticsClient projects={projects} users={users} />;
}
