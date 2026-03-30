import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { StatisticsClient } from "./statistics-client";

export default async function StatisticsPage() {
  const session = await auth();

  const [projects, users, workloadData] = await Promise.all([
    prisma.project.findMany({
      include: {
        assignments: { include: { user: true } },
      },
    }),
    prisma.user.findMany({
      where: { isActive: true },
      include: {
        projects: {
          include: { project: true },
        },
      },
    }),
    prisma.projectAssignment.groupBy({
      by: ["userId"],
      _count: { userId: true },
    }),
  ]);

  const totalProjects = projects.length;
  const activeProjects = projects.filter(
    (p) => p.phase !== "TERMINATO" && p.phase !== "STUCK"
  ).length;
  const teamMembers = users.length;
  const avgPerPerson = teamMembers > 0 ? (totalProjects / teamMembers).toFixed(1) : "0";

  const phaseDistribution = projects.reduce(
    (acc: Record<string, number>, p) => {
      acc[p.phase] = (acc[p.phase] || 0) + 1;
      return acc;
    },
    {}
  );

  const userWorkload = users.map((u) => ({
    name: u.initials || u.name?.split(" ").map((n) => n[0]).join("") || "??",
    fullName: u.name || "Unknown",
    active: u.projects.filter(
      (pa) => pa.project.phase !== "TERMINATO" && pa.project.phase !== "STUCK"
    ).length,
    stuckTerminated: u.projects.filter(
      (pa) => pa.project.phase === "TERMINATO" || pa.project.phase === "STUCK"
    ).length,
    total: u.projects.length,
  }));

  const categoryData = projects.reduce(
    (acc: Record<string, number>, p) => {
      acc[p.category] = (acc[p.category] || 0) + 1;
      return acc;
    },
    {}
  );

  return (
    <StatisticsClient
      stats={{
        totalProjects,
        activeProjects,
        teamMembers,
        avgPerPerson,
      }}
      phaseDistribution={Object.entries(phaseDistribution).map(([phase, count]) => ({
        phase,
        count,
      }))}
      userWorkload={userWorkload}
      categoryData={Object.entries(categoryData).map(([name, value]) => ({ name, value }))}
    />
  );
}
