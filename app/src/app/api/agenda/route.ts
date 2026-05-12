import { NextRequest } from "next/server";
import { auth } from "@/platform/auth";
import { prisma } from "@/platform/db";

export async function GET() {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id: userId, role } = session.user;
  const isAdmin = role === "admin" || role === "super_admin";

  // Admins see all items. Everyone else sees their own items plus items
  // on projects they are assigned to (so they see their team's deadlines).
  let where = {};
  if (!isAdmin) {
    const assignments = await prisma.projectAssignment.findMany({
      where:  { userId },
      select: { projectId: true },
    });
    const projectIds = assignments.map((a) => a.projectId);

    where = {
      OR: [
        { userId },
        { projectId: { in: projectIds } },
      ],
    };
  }

  const items = await prisma.agendaItem.findMany({
    where,
    orderBy: { date: "asc" },
    include: {
      project: { select: { id: true, title: true, code: true } },
      user: { select: { id: true, name: true, initials: true } },
    },
  });

  return Response.json(items);
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();

  const item = await prisma.agendaItem.create({
    data: {
      title: body.title,
      description: body.description || null,
      date: new Date(body.date),
      endDate: body.endDate ? new Date(body.endDate) : null,
      type: body.type || "task",
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

  return Response.json(item, { status: 201 });
}
