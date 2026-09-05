import { auth } from "@/platform/auth";
import { redirect } from "next/navigation";
import { loadSubject, type Subject } from "@/platform/authz";
import { prisma } from "@/platform/db";
import { DashboardClient, type DashboardData, type RoleTier } from "@/features/dashboard";
import {
  resolveDashboardWidgets,
  type DashboardSlot,
  type WidgetId,
} from "@/features/dashboard/domain/widgets";
import { loadProjectsNeedingAttention } from "@/features/dashboard/server/load-projects-needing-attention";
import { loadTeamWorkload } from "@/features/team-workload/server/load-team-workload";
import {
  compareAgendaItems,
  getLegacyAgendaDate,
  getLegacyAgendaType,
  scheduledWorkItemWhere,
} from "@/features/work-items";

function roleTier(role?: string | null): RoleTier {
  if (role === "super_admin" || role === "admin") return "admin";
  if (role === "director" || role === "manager" || role === "project_manager") return "lead";
  return "employee";
}

export default async function DashboardPage() {
  const session = await auth({ allowExternal: true });
  if (!session) redirect("/login");
  if (session.user.isExternal) redirect("/dashboard/chat");
  const user = session.user;
  const userId = user.id;
  const tier = roleTier(user.role);

  const now = new Date();
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(startOfDay);
  endOfDay.setDate(endOfDay.getDate() + 1);
  const sevenDaysOut = new Date(startOfDay);
  sevenDaysOut.setDate(sevenDaysOut.getDate() + 7);

  // Projects this user can call "mine" — assigned, regardless of phase
  const myProjectIdsRaw = await prisma.projectAssignment.findMany({
    where: { userId },
    select: { projectId: true },
  });
  const myProjectIds = myProjectIdsRaw.map((a) => a.projectId);

  // Widget visibility is derived from authorize(), not from the tier.
  // `tier` survives only as a presentation device — the page label and
  // strapline — and no longer decides what anyone is allowed to see.
  //
  // A null subject means the session was revoked mid-request. Degrade
  // closed: render the shell with nothing in it rather than falling back
  // to role defaults.
  const subject = await loadSubject();
  const widgets: Record<DashboardSlot, WidgetId[]> = subject
    ? resolveDashboardWidgets(subject)
    : { kpi: [], primary: [], secondary: [] };

  const data = await buildDashboardData({
    subject,
    tier,
    widgets,
    userId,
    myProjectIds,
    startOfDay,
    endOfDay,
    sevenDaysOut,
  });

  return <DashboardClient user={user} tier={tier} data={data} />;
}

async function buildDashboardData(args: {
  subject: Subject | null;
  tier: RoleTier;
  widgets: Record<DashboardSlot, WidgetId[]>;
  userId: string;
  myProjectIds: string[];
  startOfDay: Date;
  endOfDay: Date;
  sevenDaysOut: Date;
}): Promise<DashboardData> {
  const { tier, widgets, userId, myProjectIds, startOfDay, endOfDay, sevenDaysOut } = args;

  const canSee = (id: WidgetId) =>
    widgets.kpi.includes(id) ||
    widgets.primary.includes(id) ||
    widgets.secondary.includes(id);

  // ── KPIs per tier ──────────────────────────────────────────
  let kpis: DashboardData["kpis"];

  if (tier === "admin") {
    const [activeProjects, inProgress, stuck] = await Promise.all([
      prisma.project.count({ where: { phase: { notIn: ["TERMINATO", "STUCK"] } } }),
      prisma.project.count({ where: { workStatus: "doing" } }),
      prisma.project.count({
        where: { OR: [{ phase: "STUCK" }, { workStatus: "stuck" }] },
      }),
    ]);
    kpis = [
      { label: "Active projects", value: activeProjects, sub: "across the firm",      href: "/dashboard/projects",   tone: "default" },
      { label: "In progress",     value: inProgress,     sub: "currently being worked on", href: "/dashboard/projects?status=doing", tone: "default" },
      { label: "Blocked",         value: stuck,          sub: "need a decision",       href: "/dashboard/projects?status=stuck", tone: stuck > 0 ? "warn" : "default" },
    ];
  } else if (tier === "lead") {
    const myActive = myProjectIds.length === 0 ? 0 : await prisma.project.count({
      where: { id: { in: myProjectIds }, phase: { notIn: ["TERMINATO"] } },
    });
    const teamLoad = myProjectIds.length === 0 ? 0 : await prisma.projectAssignment.findMany({
      where: { projectId: { in: myProjectIds } },
      select: { userId: true },
      distinct: ["userId"],
    }).then((r) => r.length);
    const myStuck = myProjectIds.length === 0 ? 0 : await prisma.project.count({
      where: {
        id: { in: myProjectIds },
        OR: [{ phase: "STUCK" }, { workStatus: "stuck" }],
      },
    });
    kpis = [
      { label: "My projects",  value: myActive,  sub: "you are assigned to",     href: "/dashboard/projects?scope=mine",  tone: "default" },
      { label: "Team on these", value: teamLoad, sub: "people working with you", href: "/dashboard/users",                tone: "default" },
      { label: "Blocked",      value: myStuck,   sub: "in your projects",        href: "/dashboard/projects?scope=mine&status=stuck", tone: myStuck > 0 ? "warn" : "default" },
    ];
  } else {
    const myActive = myProjectIds.length === 0 ? 0 : await prisma.project.count({
      where: { id: { in: myProjectIds }, phase: { notIn: ["TERMINATO"] } },
    });
    const upcomingMeetings = await prisma.workItem.count({
      where: {
        userId,
        type: "meeting",
        status: { not: "done" },
        AND: [
          scheduledWorkItemWhere,
          {
            OR: [
              { startDate: { gte: startOfDay, lte: sevenDaysOut } },
              { startDate: null, dueDate: { gte: startOfDay, lte: sevenDaysOut } },
            ],
          },
        ],
      },
    });
    const myStuck = myProjectIds.length === 0 ? 0 : await prisma.project.count({
      where: {
        id: { in: myProjectIds },
        OR: [{ phase: "STUCK" }, { workStatus: "stuck" }],
      },
    });
    kpis = [
      { label: "My projects",      value: myActive,         sub: "you are assigned to",     href: "/dashboard/projects?scope=mine", tone: "default" },
      { label: "Upcoming meetings", value: upcomingMeetings, sub: "in the next 7 days",     href: "/dashboard/agenda",              tone: "default" },
      { label: "Blocked",          value: myStuck,          sub: "in your projects",        href: "/dashboard/projects?scope=mine&status=stuck", tone: myStuck > 0 ? "warn" : "default" },
    ];
  }

  // ── Today's Focus ──────────────────────────────────────────
  // Admin/Lead see their own agenda; everyone is filtered by user.
  const todayItems = await prisma.workItem.findMany({
    where: {
      userId,
      status: { not: "done" },
      AND: [
        scheduledWorkItemWhere,
        {
          OR: [
            { startDate: { gte: startOfDay, lt: endOfDay } },
            { startDate: null, dueDate: { gte: startOfDay, lt: endOfDay } },
          ],
        },
      ],
    },
    include: { project: { select: { code: true, title: true } } },
  });

  todayItems.sort(compareAgendaItems);

  const todayFocus = todayItems.slice(0, 6).map((it) => ({
    id: it.id,
    title: it.title,
    date: getLegacyAgendaDate(it).toISOString(),
    type: getLegacyAgendaType(it),
    priority: it.priority,
    project: it.project ? { code: it.project.code, title: it.project.title } : null,
  }));

  // ── What Changed (recent activity, scoped by tier) ─────────
  let activityWhere: { projectId?: { in: string[] } } = {};
  if (tier !== "admin") {
    activityWhere = myProjectIds.length === 0
      ? { projectId: { in: ["__none__"] } } // force empty
      : { projectId: { in: myProjectIds } };
  }

  const recentRaw = await prisma.activity.findMany({
    take: 8,
    where: activityWhere,
    orderBy: { createdAt: "desc" },
    include: {
      user: { select: { name: true, initials: true } },
      project: { select: { code: true, title: true } },
    },
  });

  const whatChanged = recentRaw.map((a) => ({
    id: a.id,
    type: a.type,
    description: a.description,
    createdAt: a.createdAt.toISOString(),
    user: a.user ? { name: a.user.name, initials: a.user.initials } : null,
    project: a.project ? { code: a.project.code, title: a.project.title } : null,
  }));

  // ── Starred projects (user's favorites) ────────────────────
  const favs = await prisma.favorite.findMany({
    where: { userId, entityType: "project" },
    orderBy: { createdAt: "desc" },
    take: 12,
    select: { entityId: true },
  });
  const favIds = favs.map((f) => f.entityId);
  const starredProjects = favIds.length === 0 ? [] : await prisma.project.findMany({
    where: { id: { in: favIds } },
    select: { id: true, code: true, title: true, image: true, phase: true, commune: true, country: true },
  });
  // Preserve the favorite order
  const orderIndex = new Map(favIds.map((id, i) => [id, i]));
  starredProjects.sort((a, b) => (orderIndex.get(a.id) ?? 0) - (orderIndex.get(b.id) ?? 0));

  const starred = starredProjects.map((p) => ({
    id: p.id,
    code: p.code,
    title: p.title,
    image: p.image,
    phase: p.phase,
    commune: p.commune,
    country: p.country,
  }));

  // ── Manager-only: projects needing attention + compact team load ─
  // 'admin' tier sees the whole studio. 'lead' (manager / project_manager
  // / director) is scoped to their own assignments — the dashboard
  // mirrors the existing tier semantics; the full firm-wide view lives
  // on /dashboard/team-workload.
  let needsAttention: DashboardData["needsAttention"];
  let teamLoad: DashboardData["teamLoad"];

  if (canSee("needs-attention")) {
    const attentionRows = await loadProjectsNeedingAttention({
      scopedProjectIds: tier === "admin" ? null : myProjectIds,
      limit: 6,
    });
    needsAttention = attentionRows.map((r) => ({
      projectId: r.projectId,
      code: r.code,
      title: r.title,
      phase: r.phase,
      workStatus: r.workStatus,
      severity: r.severity,
      daysSinceStatus: r.daysSinceStatus,
      lastAuthor: r.lastAuthor,
      lastSummary: r.lastSummary,
    }));
  }

  // Gated independently of needs-attention: the two are separate actions
  // (project:health.read vs team:workload.read), so a grant for one must
  // not silently enable the other.
  if (canSee("team-load") && args.subject) {
    // Compact team-load: top 5 by score from the full snapshot.
    // We call the same server function the /team-workload page does so
    // there's only one definition of "score" in the codebase.
    const workload = await loadTeamWorkload(args.subject);
    teamLoad = workload.members.slice(0, 5).map((m) => ({
      userId: m.user.id,
      name: m.user.name,
      email: m.user.email,
      initials: m.user.initials,
      role: m.user.role,
      projectsActive: m.projects.length,
      tasksOpen: m.tasks.open,
      tasksOverdue: m.tasks.overdue,
      agendaOverdue: m.agenda.overdue,
      load: m.load,
      score: m.score,
    }));
  }

  return { kpis, todayFocus, whatChanged, starred, needsAttention, teamLoad };
}
