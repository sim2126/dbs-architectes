import { NextRequest } from "next/server";
import { auth } from "@/platform/auth";
import { prisma } from "@/platform/db";
import {
  compareAgendaItems,
  scheduledWorkItemWhere,
  toLegacyAgendaItem,
} from "@/features/work-items";

const WORK_ITEM_TYPES = ["task", "deadline", "milestone", "meeting"] as const;
const LEGACY_AGENDA_TYPES = [...WORK_ITEM_TYPES, "call"] as const;

function isLegacyAgendaType(value: unknown): value is (typeof LEGACY_AGENDA_TYPES)[number] {
  return LEGACY_AGENDA_TYPES.includes(value as (typeof LEGACY_AGENDA_TYPES)[number]);
}

export async function GET() {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id: userId, role } = session.user;
  const isAdmin = role === "admin" || role === "super_admin";

  // Admins see all items. Everyone else sees their own items plus items
  // on projects they are assigned to (so they see their team's deadlines).
  let visibilityWhere = {};
  if (!isAdmin) {
    const assignments = await prisma.projectAssignment.findMany({
      where:  { userId },
      select: { projectId: true },
    });
    const projectIds = assignments.map((a) => a.projectId);

    visibilityWhere = {
      OR: [
        { userId },
        { projectId: { in: projectIds } },
      ],
    };
  }

  const items = await prisma.workItem.findMany({
    where: {
      AND: [scheduledWorkItemWhere, visibilityWhere],
    },
    include: {
      project: { select: { id: true, title: true, code: true } },
      user: { select: { id: true, name: true, initials: true } },
    },
  });

  return Response.json(
    items.sort(compareAgendaItems).map((item) => ({
      ...toLegacyAgendaItem(item),
      project: item.project,
      user: item.user,
    })),
  );
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const legacyType = body.type || "task";
  if (!isLegacyAgendaType(legacyType)) {
    return Response.json({ error: "Invalid agenda item type" }, { status: 400 });
  }
  const type = legacyType === "call" ? "meeting" : legacyType;

  const date = new Date(body.date);
  const endDate = body.endDate ? new Date(body.endDate) : null;
  const id = crypto.randomUUID();

  const item = await prisma.workItem.create({
    data: {
      id,
      legacyAgendaId: id,
      legacyAgendaType: legacyType,
      title: body.title,
      description: body.description || null,
      startDate: endDate ? date : null,
      dueDate: endDate ?? date,
      type,
      priority: body.priority || "medium",
      status: body.status || "pending",
      projectId: body.projectId || null,
      userId: session.user.id,
      color: body.color || null,
      allDay: body.allDay || false,
    },
    include: {
      project: { select: { id: true, title: true, code: true } },
      user: { select: { id: true, name: true, initials: true } },
    },
  });

  return Response.json(
    {
      ...toLegacyAgendaItem(item),
      project: item.project,
      user: item.user,
    },
    { status: 201 },
  );
}
