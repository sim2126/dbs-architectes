import { prisma } from "@/platform/db";
import {
  compareAgendaItems,
  getLegacyAgendaDate,
  getLegacyAgendaType,
  scheduledWorkItemWhere,
} from "@/features/work-items";

// ─── OpenAI Tool Definitions ──────────────────────────────────

export const AGENT_TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "search_projects",
      description:
        "Search and filter the DBS project portfolio. Use for browsing, listing, counting, or filtering projects by any combination of phase, work status, category, client, commune, year, or free text.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Free-text search across project title, code, client, and commune.",
          },
          phase: {
            type: "string",
            enum: ["ETUDE / AP", "MAE", "CHANTIER", "EXE / DG / DV / 3D", "TERMINATO", "STUCK"],
            description: "Filter by construction phase.",
          },
          work_status: {
            type: "string",
            enum: ["todo", "doing", "stuck", "completed"],
            description: "Filter by work status: todo=Not Started, doing=Working on it, stuck=Stuck, completed=Done.",
          },
          category: { type: "string", description: "Filter by project category (e.g. Residenziale, Commerciale)." },
          client: { type: "string", description: "Filter by client name (partial match)." },
          commune: { type: "string", description: "Filter by Swiss commune/municipality." },
          year: { type: "number", description: "Filter by project year." },
          status: { type: "string", enum: ["active", "archived"], description: "Filter by project status. Default: active." },
          limit: { type: "number", description: "Max results to return. Default: 15.", default: 15 },
        },
        required: [],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_project_details",
      description:
        "Get full details for a single project: metadata, team assignments with roles, recent activity events, and upcoming agenda items. Use after identifying a project from search results.",
      parameters: {
        type: "object",
        properties: {
          project_id: { type: "string", description: "The project ID (from search results)." },
        },
        required: ["project_id"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_project_thread",
      description:
        "Get the internal update thread and team messages for a specific project. Returns chronological messages from the project channel. Use when asked about team discussions, latest updates, or internal communications on a project.",
      parameters: {
        type: "object",
        properties: {
          project_id: { type: "string", description: "The project ID." },
          limit: { type: "number", description: "Number of messages to return. Default: 20.", default: 20 },
        },
        required: ["project_id"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_team_messages",
      description:
        "Get recent messages from team chat channels (general, announcements, or any named channel). Use for cross-project team discussions, recent firm-wide communications, or when asked what the team has been discussing.",
      parameters: {
        type: "object",
        properties: {
          channel_name: {
            type: "string",
            description: "Channel name to filter (e.g. 'general', 'announcements'). Omit to search across all non-project channels.",
          },
          from_date: { type: "string", description: "ISO date string. Only return messages after this date." },
          limit: { type: "number", description: "Number of messages. Default: 30.", default: 30 },
        },
        required: [],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_agenda",
      description:
        "Get agenda items, deadlines, and milestones. Can filter by date range, priority, project, or status. Use for deadline queries, upcoming work, or overdue items.",
      parameters: {
        type: "object",
        properties: {
          from_date: { type: "string", description: "ISO date. Return items on or after this date." },
          to_date: { type: "string", description: "ISO date. Return items on or before this date." },
          priority: {
            type: "string",
            enum: ["critical", "high", "medium", "low"],
            description: "Filter by priority level.",
          },
          project_id: { type: "string", description: "Filter agenda items for a specific project." },
          status: {
            type: "string",
            enum: ["pending", "in_progress", "done"],
            description: "Filter by completion status.",
          },
          limit: { type: "number", description: "Max items. Default: 20.", default: 20 },
          include_overdue: { type: "boolean", description: "If true, include items past their due date.", default: true },
        },
        required: [],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_team_workload",
      description:
        "Get a per-person breakdown of project assignments, work status distribution, and blocked project count. Use for capacity analysis, identifying overloaded team members, or understanding who owns what.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_statistics",
      description:
        "Get aggregate portfolio statistics: total projects, phase distribution, work status breakdown, unassigned projects count, team size, and recent activity volume.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_activity_log",
      description:
        "Get recent activity events across the platform: project creations, status changes, assignments, file uploads. Use for catch-up queries ('what changed since X'), recent history, or audit-style questions.",
      parameters: {
        type: "object",
        properties: {
          project_id: { type: "string", description: "Filter to a specific project." },
          from_date: { type: "string", description: "ISO date. Only events after this date." },
          limit: { type: "number", description: "Max events. Default: 25.", default: 25 },
        },
        required: [],
      },
    },
  },
];

// ─── Tool Handlers ────────────────────────────────────────────

export type AgentToolSubject = { userId: string; role: string };

function isAdmin(subject: AgentToolSubject): boolean {
  return subject.role === "admin" || subject.role === "super_admin";
}

export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  subject: AgentToolSubject,
): Promise<unknown> {
  switch (name) {
    case "search_projects":
      return searchProjects(args, subject);
    case "get_project_details":
      return getProjectDetails(args.project_id as string, subject);
    case "get_project_thread":
      return getProjectThread(args.project_id as string, (args.limit as number) ?? 20, subject);
    case "get_team_messages":
      return getTeamMessages(args, subject);
    case "get_agenda":
      return getAgenda(args, subject);
    case "get_team_workload":
      return getTeamWorkload(subject);
    case "get_statistics":
      return getStatistics(subject);
    case "get_activity_log":
      return getActivityLog(args, subject);
    default:
      return { error: `Unknown tool: ${name}` };
  }
}

// ─── Tool Implementations ─────────────────────────────────────

async function searchProjects(args: Record<string, unknown>, subject: AgentToolSubject) {
  const limit = Math.min((args.limit as number) ?? 15, 50);
  const where: Record<string, unknown> = {};

  if (!isAdmin(subject)) {
    where.assignments = { some: { userId: subject.userId } };
  }

  if (args.status) where.status = args.status;
  else where.status = "active";

  if (args.phase) where.phase = args.phase;
  if (args.work_status) where.workStatus = args.work_status;
  if (args.category) where.category = args.category;
  if (args.year) where.year = Number(args.year);

  if (args.client) {
    where.client = { contains: args.client as string, mode: "insensitive" };
  }
  if (args.commune) {
    where.commune = { contains: args.commune as string, mode: "insensitive" };
  }
  if (args.query) {
    const q = args.query as string;
    where.OR = [
      { title: { contains: q, mode: "insensitive" } },
      { code: { contains: q, mode: "insensitive" } },
      { client: { contains: q, mode: "insensitive" } },
      { commune: { contains: q, mode: "insensitive" } },
      { description: { contains: q, mode: "insensitive" } },
    ];
  }

  const projects = await prisma.project.findMany({
    where,
    take: limit,
    orderBy: { updatedAt: "desc" },
    include: {
      assignments: {
        include: { user: { select: { name: true, role: true, initials: true } } },
      },
      workItems: {
        where: {
          status: { not: "done" },
          AND: [
            scheduledWorkItemWhere,
            {
              OR: [
                { startDate: { gte: new Date() } },
                { startDate: null, dueDate: { gte: new Date() } },
              ],
            },
          ],
        },
      },
    },
  });

  return {
    count: projects.length,
    projects: projects.map((p) => {
      const nextDeadline = p.workItems.sort(compareAgendaItems)[0];
      return {
        id: p.id,
        code: p.code,
        title: p.title,
        category: p.category,
        phase: p.phase,
        work_status: p.workStatus,
        status: p.status,
        client: p.client,
        commune: p.commune,
        year: p.year,
        billing: p.billing,
        team: p.assignments.map((a) => ({
          name: a.user.name,
          role: a.role || a.user.role,
          initials: a.user.initials,
        })),
        next_deadline: nextDeadline
          ? {
              title: nextDeadline.title,
              date: getLegacyAgendaDate(nextDeadline).toISOString().split("T")[0],
              priority: nextDeadline.priority,
            }
          : null,
        last_updated: p.updatedAt.toISOString(),
      };
    }),
  };
}

async function getProjectDetails(projectId: string, subject: AgentToolSubject) {
  const project = await prisma.project.findFirst({
    where: {
      id: projectId,
      ...(isAdmin(subject) ? {} : { assignments: { some: { userId: subject.userId } } }),
    },
    include: {
      assignments: {
        include: { user: { select: { id: true, name: true, role: true, initials: true, email: true, department: true } } },
      },
      workItems: {
        where: scheduledWorkItemWhere,
        include: { user: { select: { name: true } } },
      },
      activities: {
        orderBy: { createdAt: "desc" },
        take: 5,
        include: { user: { select: { name: true, initials: true } } },
      },
    },
  });

  if (!project) return { error: "Project not found." };

  return {
    id: project.id,
    code: project.code,
    title: project.title,
    category: project.category,
    phase: project.phase,
    work_status: project.workStatus,
    status: project.status,
    client: project.client,
    commune: project.commune,
    year: project.year,
    typology: project.typology,
    terrain: project.terrain,
    billing: project.billing,
    description: project.description,
    notes: project.notes,
    area: project.area,
    floors: project.floors,
    team: project.assignments.map((a) => ({
      name: a.user.name,
      email: a.user.email,
      role: a.role || a.user.role,
      department: a.user.department,
      assigned_at: a.assignedAt.toISOString().split("T")[0],
    })),
    upcoming_agenda: project.workItems.sort(compareAgendaItems).slice(0, 5).map((item) => ({
      title: item.title,
      date: getLegacyAgendaDate(item).toISOString().split("T")[0],
      priority: item.priority,
      status: item.status,
      type: getLegacyAgendaType(item),
      description: item.description,
    })),
    recent_activity: project.activities.map((a) => ({
      type: a.type,
      description: a.description,
      by: a.user?.name,
      date: a.createdAt.toISOString().split("T")[0],
    })),
    created_at: project.createdAt.toISOString().split("T")[0],
    last_updated: project.updatedAt.toISOString().split("T")[0],
  };
}

async function getProjectThread(projectId: string, limit: number, subject: AgentToolSubject) {
  const channel = await prisma.channel.findFirst({
    where: {
      projectId,
      type: "project",
      ...(isAdmin(subject)
        ? {}
        : { project: { assignments: { some: { userId: subject.userId } } } }),
    },
    include: {
      messages: {
        where: { deletedAt: null, parentId: null },
        orderBy: { createdAt: "desc" },
        take: limit,
        include: {
          user: { select: { name: true, initials: true, role: true } },
          replies: {
            take: 2,
            orderBy: { createdAt: "desc" },
            include: { user: { select: { name: true } } },
          },
        },
      },
    },
  });

  if (!channel) return { messages: [], note: "No project thread found for this project." };

  return {
    channel: channel.name,
    message_count: channel.messages.length,
    messages: channel.messages.reverse().map((m) => ({
      author: m.user.name,
      role: m.user.role,
      content: m.content,
      date: m.createdAt.toISOString().split("T")[0],
      time: m.createdAt.toISOString().split("T")[1].slice(0, 5),
      reply_count: m.replies.length,
    })),
  };
}

async function getTeamMessages(args: Record<string, unknown>, subject: AgentToolSubject) {
  const limit = Math.min((args.limit as number) ?? 30, 50);
  const where: Record<string, unknown> = {
    deletedAt: null,
    parentId: null,
    channel: {
      projectId: null,
      ...(isAdmin(subject)
        ? {}
        : {
            OR: [
              { type: "public" },
              { createdBy: subject.userId },
              { members: { some: { userId: subject.userId } } },
            ],
          }),
    },
  };

  if (args.from_date) {
    where.createdAt = { gte: new Date(args.from_date as string) };
  }
  if (args.channel_name) {
    (where.channel as Record<string, unknown>).name = {
      contains: args.channel_name as string,
      mode: "insensitive",
    };
  }

  const messages = await prisma.message.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      user: { select: { name: true, role: true } },
      channel: { select: { name: true } },
    },
  });

  return {
    count: messages.length,
    messages: messages.reverse().map((m) => ({
      channel: m.channel.name,
      author: m.user.name,
      role: m.user.role,
      content: m.content,
      date: m.createdAt.toISOString().split("T")[0],
      time: m.createdAt.toISOString().split("T")[1].slice(0, 5),
    })),
  };
}

async function getAgenda(args: Record<string, unknown>, subject: AgentToolSubject) {
  const limit = Math.min((args.limit as number) ?? 20, 50);
  const where: Record<string, unknown> = {};
  const andFilters: Record<string, unknown>[] = [{ ...scheduledWorkItemWhere }];
  if (!isAdmin(subject)) {
    andFilters.push({
      OR: [
        { userId: subject.userId },
        { project: { assignments: { some: { userId: subject.userId } } } },
      ],
    });
  }

  if (args.project_id) where.projectId = args.project_id;
  if (args.priority) where.priority = args.priority;
  if (args.status) where.status = args.status;

  const dateFilter: Record<string, Date> = {};
  if (args.from_date) dateFilter.gte = new Date(args.from_date as string);
  if (args.to_date) dateFilter.lte = new Date(args.to_date as string);
  if (!args.from_date && args.include_overdue !== false) {
    // Default: show all upcoming + recent overdue
  } else if (!args.from_date) {
    dateFilter.gte = new Date();
  }
  if (Object.keys(dateFilter).length > 0) {
    andFilters.push({
      OR: [
        { startDate: dateFilter },
        { startDate: null, dueDate: dateFilter },
      ],
    });
  }
  if (andFilters.length > 0) where.AND = andFilters;

  const items = await prisma.workItem.findMany({
    where,
    include: {
      project: { select: { code: true, title: true } },
      user: { select: { name: true } },
    },
  });
  items.sort(compareAgendaItems);
  const limitedItems = items.slice(0, limit);

  const now = new Date();
  return {
    count: limitedItems.length,
    items: limitedItems.map((item) => {
      const date = getLegacyAgendaDate(item);
      return {
      title: item.title,
      date: date.toISOString().split("T")[0],
      priority: item.priority,
      status: item.status,
      type: getLegacyAgendaType(item),
      is_overdue: date < now && item.status !== "done",
      project: item.project ? { code: item.project.code, title: item.project.title } : null,
      assigned_to: item.user.name,
      description: item.description,
      };
    }),
  };
}

async function getTeamWorkload(subject: AgentToolSubject) {
  const users = await prisma.user.findMany({
    where: { isActive: true, ...(isAdmin(subject) ? {} : { id: subject.userId }) },
    include: {
      projects: {
        include: {
          project: { select: { workStatus: true, phase: true, status: true } },
        },
      },
    },
  });

  return {
    team_size: users.length,
    workload: users
      .filter((u) => u.projects.length > 0)
      .map((u) => {
        const activeProjects = u.projects.filter((p) => p.project.status === "active");
        const byStatus = {
          todo: activeProjects.filter((p) => p.project.workStatus === "todo").length,
          doing: activeProjects.filter((p) => p.project.workStatus === "doing").length,
          stuck: activeProjects.filter((p) => p.project.workStatus === "stuck").length,
          completed: activeProjects.filter((p) => p.project.workStatus === "completed").length,
        };
        return {
          name: u.name,
          role: u.role,
          total_assigned: activeProjects.length,
          not_started: byStatus.todo,
          working_on: byStatus.doing,
          stuck: byStatus.stuck,
          done: byStatus.completed,
          risk_flag: byStatus.stuck > 0 ? `${byStatus.stuck} blocked project(s)` : null,
        };
      })
      .sort((a, b) => b.total_assigned - a.total_assigned),
  };
}

async function getStatistics(subject: AgentToolSubject) {
  const projectWhere = {
    status: "active",
    ...(isAdmin(subject) ? {} : { assignments: { some: { userId: subject.userId } } }),
  };
  const [total, byPhase, byStatus, unassigned, userCount, recentActivity] = await Promise.all([
    prisma.project.count({ where: projectWhere }),
    prisma.project.groupBy({ by: ["phase"], where: projectWhere, _count: true }),
    prisma.project.groupBy({ by: ["workStatus"], where: projectWhere, _count: true }),
    prisma.project.count({
      where: isAdmin(subject) ? { status: "active", assignments: { none: {} } } : { id: "__none__" },
    }),
    prisma.user.count({ where: { isActive: true, ...(isAdmin(subject) ? {} : { id: subject.userId }) } }),
    prisma.activity.count({
      where: {
        createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        ...(isAdmin(subject)
          ? {}
          : { project: { assignments: { some: { userId: subject.userId } } } }),
      },
    }),
  ]);

  return {
    total_active_projects: total,
    unassigned_projects: unassigned,
    team_size: userCount,
    activity_last_7_days: recentActivity,
    phase_distribution: byPhase.map((p) => ({ phase: p.phase, count: p._count })),
    work_status_distribution: byStatus.map((s) => ({
      status: s.workStatus,
      label:
        s.workStatus === "todo"
          ? "Not Started"
          : s.workStatus === "doing"
          ? "Working on it"
          : s.workStatus === "stuck"
          ? "Stuck"
          : "Done",
      count: s._count,
    })),
  };
}

async function getActivityLog(args: Record<string, unknown>, subject: AgentToolSubject) {
  const limit = Math.min((args.limit as number) ?? 25, 50);
  const where: Record<string, unknown> = {};
  if (!isAdmin(subject)) {
    where.OR = [
      { userId: subject.userId },
      { project: { assignments: { some: { userId: subject.userId } } } },
    ];
  }

  if (args.project_id) where.projectId = args.project_id;
  if (args.from_date) {
    where.createdAt = { gte: new Date(args.from_date as string) };
  }

  const activities = await prisma.activity.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      user: { select: { name: true, initials: true } },
      project: { select: { code: true, title: true } },
    },
  });

  return {
    count: activities.length,
    events: activities.map((a) => ({
      type: a.type,
      description: a.description,
      by: a.user?.name ?? "System",
      project: a.project ? { code: a.project.code, title: a.project.title } : null,
      date: a.createdAt.toISOString().split("T")[0],
      time: a.createdAt.toISOString().split("T")[1].slice(0, 5),
    })),
  };
}
