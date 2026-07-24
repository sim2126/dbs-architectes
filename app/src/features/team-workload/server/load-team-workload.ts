/**
 * loadTeamWorkload — server fan-out for the team workload view.
 *
 * Walks every active workspace member and assembles their workload
 * snapshot: active project assignments (only non-terminal phases),
 * task buckets (open/doing/overdue/this-week), agenda buckets
 * (overdue/next-7-days/total), and the most recent status update
 * they authored. The result is a single payload sized for a roster
 * of ~50–200 people — well within a single request.
 *
 * Authorization is the caller's concern. This function trusts that
 * the page server component already enforced manager-or-above access.
 */

import { prisma } from "@/platform/db";
import {
  getLegacyAgendaDate,
  personalTaskWorkItemWhere,
  scheduledWorkItemWhere,
} from "@/features/work-items";
import type {
  TeamMemberWorkload,
  TeamWorkloadData,
  WorkloadLoadLevel,
  WorkloadProject,
  WorkloadStatusUpdate,
} from "../domain/types";

// Phases that imply work is no longer active. These don't count toward
// a user's project load (a "TERMINATO" project is a credit, not a
// commitment).
const TERMINAL_PHASES = new Set(["TERMINATO", "CANCELLED", "ARCHIVED"]);

function startOfDayUtc(d: Date): Date {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  return x;
}

function scoreToLoad(score: number): WorkloadLoadLevel {
  if (score >= 28) return "overloaded";
  if (score >= 18) return "heavy";
  if (score >= 8) return "balanced";
  return "light";
}

export async function loadTeamWorkload(): Promise<TeamWorkloadData> {
  const now = new Date();
  const today = startOfDayUtc(now);
  const in7 = new Date(today);
  in7.setUTCDate(today.getUTCDate() + 7);

  type UserRow = {
    id: string;
    name: string | null;
    email: string;
    initials: string | null;
    image: string | null;
    role: string;
    defaultCountry: string | null;
  };

  const users = (await prisma.user.findMany({
    where: { isActive: true },
    orderBy: [{ name: "asc" }],
    select: {
      id: true,
      name: true,
      email: true,
      initials: true,
      image: true,
      role: true,
      defaultCountry: true,
    },
  })) as UserRow[];

  if (users.length === 0) {
    return { members: [], generatedAt: now.toISOString() };
  }

  const userIds = users.map((u) => u.id);

  type AssignmentRow = {
    userId: string;
    role: string | null;
    project: {
      id: string;
      code: string;
      title: string;
      phase: string;
      workStatus: string;
    };
  };

  type TaskRow = {
    userId: string;
    status: string;
    dueDate: Date | null;
  };

  type AgendaRow = {
    id: string;
    userId: string;
    startDate: Date | null;
    dueDate: Date | null;
    status: string;
  };

  type StatusRow = {
    health: string;
    createdAt: Date;
    authorId: string;
    project: { code: string };
  };

  const [assignments, tasks, agendaWorkItems, statusRows] = await Promise.all([
    prisma.projectAssignment.findMany({
      where: { userId: { in: userIds } },
      select: {
        userId: true,
        role: true,
        project: {
          select: {
            id: true,
            code: true,
            title: true,
            phase: true,
            workStatus: true,
          },
        },
      },
    }) as Promise<AssignmentRow[]>,
    prisma.workItem.findMany({
      where: {
        userId: { in: userIds },
        ...personalTaskWorkItemWhere,
        status: { not: "done" },
      },
      select: {
        id: true,
        userId: true,
        status: true,
        dueDate: true,
      },
    }) as Promise<TaskRow[]>,
    prisma.workItem.findMany({
      where: {
        userId: { in: userIds },
        status: { not: "done" },
        AND: [scheduledWorkItemWhere],
      },
      select: {
        id: true,
        userId: true,
        startDate: true,
        dueDate: true,
        status: true,
      },
    }) as Promise<AgendaRow[]>,
    prisma.projectStatusUpdate.findMany({
      where: { authorId: { in: userIds } },
      orderBy: { createdAt: "desc" },
      select: {
        health: true,
        createdAt: true,
        authorId: true,
        project: { select: { code: true } },
      },
    }) as Promise<StatusRow[]>,
  ]);

  const agenda = agendaWorkItems.map((item) => ({
    userId: item.userId,
    date: getLegacyAgendaDate(item),
    status: item.status,
  }));

  // Group everything by userId. Single pass per collection.
  const projectsByUser = new Map<string, WorkloadProject[]>();
  for (const a of assignments) {
    if (TERMINAL_PHASES.has(a.project.phase)) continue;
    const list = projectsByUser.get(a.userId) ?? [];
    list.push({
      id: a.project.id,
      code: a.project.code,
      title: a.project.title,
      phase: a.project.phase,
      workStatus: a.project.workStatus,
      assignmentRole: a.role,
    });
    projectsByUser.set(a.userId, list);
  }

  const taskBuckets = new Map<
    string,
    { open: number; doing: number; overdue: number; dueThisWeek: number }
  >();
  for (const t of tasks) {
    const b = taskBuckets.get(t.userId) ?? {
      open: 0,
      doing: 0,
      overdue: 0,
      dueThisWeek: 0,
    };
    b.open += 1;
    if (t.status === "doing") b.doing += 1;
    if (t.dueDate) {
      if (t.dueDate < today) b.overdue += 1;
      else if (t.dueDate < in7) b.dueThisWeek += 1;
    }
    taskBuckets.set(t.userId, b);
  }

  const agendaBuckets = new Map<
    string,
    { total: number; next7days: number; overdue: number }
  >();
  for (const a of agenda) {
    const b = agendaBuckets.get(a.userId) ?? {
      total: 0,
      next7days: 0,
      overdue: 0,
    };
    b.total += 1;
    if (a.date < today) b.overdue += 1;
    else if (a.date < in7) b.next7days += 1;
    agendaBuckets.set(a.userId, b);
  }

  // We took ordered DESC; first match per author is the latest.
  const latestStatusByUser = new Map<string, WorkloadStatusUpdate>();
  for (const s of statusRows) {
    if (latestStatusByUser.has(s.authorId)) continue;
    latestStatusByUser.set(s.authorId, {
      health: s.health as "on_track" | "at_risk" | "off_track",
      createdAt: s.createdAt.toISOString(),
      projectCode: s.project.code,
    });
  }

  const members: TeamMemberWorkload[] = users.map((u) => {
    const projects = projectsByUser.get(u.id) ?? [];
    const taskBucket =
      taskBuckets.get(u.id) ?? { open: 0, doing: 0, overdue: 0, dueThisWeek: 0 };
    const agendaBucket =
      agendaBuckets.get(u.id) ?? { total: 0, next7days: 0, overdue: 0 };

    // Composite load score. Tuned for a typical DBS studio member —
    // each active project contributes 3, each open task 1, each
    // overdue artefact 4 (heavier weight), and the next-7-days
    // agenda items 2 each. Numbers are tunable as the team
    // accumulates a baseline.
    const score =
      projects.length * 3 +
      taskBucket.open +
      taskBucket.overdue * 4 +
      agendaBucket.overdue * 4 +
      agendaBucket.next7days * 2;

    return {
      user: u,
      projects,
      tasks: taskBucket,
      agenda: agendaBucket,
      latestStatus: latestStatusByUser.get(u.id) ?? null,
      load: scoreToLoad(score),
      score,
    };
  });

  // Sort by score DESC so the manager opens the page and sees the most
  // loaded people at the top. Ties broken by name ASC.
  members.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return (a.user.name ?? a.user.email).localeCompare(b.user.name ?? b.user.email);
  });

  return {
    members,
    generatedAt: now.toISOString(),
  };
}
