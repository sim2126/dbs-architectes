import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  DashboardClient,
  type DashboardActivity,
  type DashboardStarred,
  type DashboardTask,
} from "./dashboard-client";

const IN_PROGRESS_PHASES = ["MAE", "CHANTIER", "EXE/DG/DV/3D"];

function dueLabel(due: Date | null): string {
  if (!due) return "—";
  const now = new Date();
  const diff = Math.round(
    (startOfDay(due).getTime() - startOfDay(now).getTime()) / 86400000,
  );
  if (diff < 0) return diff === -1 ? "Yesterday" : `${-diff}d overdue`;
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff < 7) return `in ${diff} days`;
  if (diff < 14) return "next week";
  return `in ${Math.round(diff / 7)} weeks`;
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function relTime(d: Date): string {
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  const days = Math.floor(diff / 86400);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
}

function todayLabel(d: Date): string {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

function normalizePriority(p: string): DashboardTask["priority"] {
  const lower = p.toLowerCase();
  if (lower === "critical") return "critical";
  if (lower === "high") return "high";
  if (lower === "low") return "low";
  return "medium";
}

export default async function DashboardPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const userId = session.user.id;
  const now = new Date();
  const in14 = new Date(now.getTime() + 14 * 86400000);

  const [
    activeCount,
    terminatoCount,
    inProgressCount,
    stuckCount,
    deadlines,
    highPriorityCount,
    tasks,
    activities,
    starredFavorites,
  ] = await Promise.all([
    prisma.project.count({
      where: { phase: { notIn: ["TERMINATO", "STUCK"] } },
    }),
    prisma.project.count({ where: { phase: "TERMINATO" } }),
    prisma.project.count({ where: { phase: { in: IN_PROGRESS_PHASES } } }),
    prisma.project.count({ where: { phase: "STUCK" } }),
    prisma.agendaItem.count({
      where: {
        date: { gte: now, lte: in14 },
        status: { not: "done" },
      },
    }),
    prisma.agendaItem.count({
      where: {
        date: { gte: now, lte: in14 },
        status: { not: "done" },
        priority: "high",
      },
    }),
    prisma.task.findMany({
      where: { userId, status: { not: "done" } },
      orderBy: [
        { dueDate: { sort: "asc", nulls: "last" } },
        { priority: "desc" },
      ],
      take: 5,
      include: {
        project: { select: { id: true, code: true } },
      },
    }),
    prisma.activity.findMany({
      take: 5,
      orderBy: { createdAt: "desc" },
      include: {
        user: { select: { id: true, name: true, initials: true } },
        project: { select: { id: true, title: true, code: true } },
      },
    }),
    prisma.favorite.findMany({
      where: { userId, entityType: "project" },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
  ]);

  const starredIds = starredFavorites.map((f) => f.entityId);
  const starredProjects = starredIds.length
    ? await prisma.project.findMany({
        where: { id: { in: starredIds } },
        select: {
          id: true,
          code: true,
          title: true,
          phase: true,
          workStatus: true,
          image: true,
        },
      })
    : [];

  const byId = new Map(starredProjects.map((p) => [p.id, p]));
  const starred: DashboardStarred[] = starredIds
    .map((id) => byId.get(id))
    .filter((p): p is NonNullable<typeof p> => Boolean(p))
    .map((p) => ({
      id: p.id,
      code: p.code,
      title: p.title,
      phase: p.phase,
      workStatus: p.workStatus,
      image: p.image ?? null,
    }));

  const taskList: DashboardTask[] = tasks.map((t) => ({
    id: t.id,
    title: t.title,
    code: t.project?.code ?? null,
    projectId: t.project?.id ?? null,
    priority: normalizePriority(t.priority),
    dueLabel: dueLabel(t.dueDate),
    state: (t.status === "done"
      ? "done"
      : t.status === "doing"
        ? "doing"
        : "todo") as DashboardTask["state"],
  }));

  const activityList: DashboardActivity[] = activities.map((a) => ({
    id: a.id,
    who: a.user.name ?? a.user.initials ?? "Someone",
    initials: a.user.initials ?? "?",
    description: a.description,
    code: a.project?.code ?? null,
    projectId: a.project?.id ?? null,
    projectTitle: a.project?.title ?? null,
    ago: relTime(a.createdAt),
  }));

  const fullName = session.user.name ?? "there";
  const firstName = fullName.split(/\s+/)[0] || fullName;

  return (
    <DashboardClient
      greetingName={firstName}
      todayLabel={todayLabel(now)}
      kpi={{
        active: activeCount,
        terminato: terminatoCount,
        inProgress: inProgressCount,
        stuck: stuckCount,
        deadlines14d: deadlines,
        highPriority: highPriorityCount,
      }}
      tasks={taskList}
      activity={activityList}
      starred={starred}
    />
  );
}
