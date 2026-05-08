import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  ProjectDetailClient,
  type ProjectDetailActivity,
  type ProjectDetailAgendaItem,
  type ProjectDetailMember,
} from "./project-detail-client";

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function dateLabel(d: Date): string {
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

function relTime(d: Date): string {
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  const days = Math.floor(diff / 86400);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString("en-CH", { day: "numeric", month: "short" });
}

function normalizePriority(p: string | null | undefined): "high" | "medium" | "low" {
  const l = (p ?? "").toLowerCase();
  if (l === "high" || l === "critical") return "high";
  if (l === "low") return "low";
  return "medium";
}

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/login");

  const { id } = await params;
  const userId = session.user.id;

  // The route accepts either the project id OR the project code so the
  // /dashboard/projects?code=… deep-link from the command palette works.
  const project = await prisma.project.findFirst({
    where: { OR: [{ id }, { code: id }] },
    include: {
      assignments: {
        include: {
          user: {
            select: { id: true, name: true, initials: true },
          },
        },
      },
    },
  });

  if (!project) notFound();

  const [agendaItems, activities, favorite] = await Promise.all([
    prisma.agendaItem.findMany({
      where: { projectId: project.id },
      orderBy: [{ status: "asc" }, { date: "asc" }],
      take: 10,
    }),
    prisma.activity.findMany({
      where: { projectId: project.id },
      orderBy: { createdAt: "desc" },
      take: 10,
      include: {
        user: { select: { name: true, initials: true } },
      },
    }),
    prisma.favorite.findFirst({
      where: { userId, entityType: "project", entityId: project.id },
    }),
  ]);

  const team: ProjectDetailMember[] = project.assignments.map((a) => ({
    initials: a.user.initials ?? "?",
    name: a.user.name ?? a.user.initials ?? "Member",
    role: a.role ?? "Team",
  }));

  const agenda: ProjectDetailAgendaItem[] = agendaItems.map((a) => ({
    id: a.id,
    date: dateLabel(a.date),
    title: a.title,
    priority: normalizePriority(a.priority),
    status: a.status,
  }));

  const activity: ProjectDetailActivity[] = activities.map((a) => ({
    id: a.id,
    who: a.user.name ?? a.user.initials ?? "Someone",
    initials: a.user.initials ?? "?",
    description: a.description,
    ago: relTime(a.createdAt),
  }));

  const editable =
    session.user.role === "super_admin" ||
    session.user.role === "admin" ||
    session.user.role === "project_manager" ||
    session.user.role === "director" ||
    session.user.role === "manager";

  return (
    <ProjectDetailClient
      project={{
        id: project.id,
        code: project.code,
        title: project.title,
        phase: project.phase,
        workStatus: project.workStatus,
        year: project.year,
        commune: project.commune,
        country: project.country,
        description: project.description,
        client: project.client,
        category: project.category,
        typology: project.typology,
        floors: project.floors,
        area: project.area,
        billing: project.billing,
        image: project.image,
        starred: !!favorite,
      }}
      team={team}
      agenda={agenda}
      activity={activity}
      editable={editable}
    />
  );
}
