import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

// PATCH /api/tasks/[id] — update fields, including drag-reorder via position
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = (await request.json()) as {
    title?: string;
    description?: string | null;
    dueDate?: string | null;
    status?: string;
    priority?: string;
    projectId?: string | null;
    position?: number;
  };

  const data: Record<string, unknown> = {};
  if (typeof body.title === "string") data.title = body.title.trim().slice(0, 500);
  if (body.description !== undefined) {
    data.description = body.description ? body.description.slice(0, 5000) : null;
  }
  if (body.dueDate !== undefined) {
    data.dueDate = body.dueDate ? new Date(body.dueDate) : null;
  }
  if (typeof body.status === "string") {
    data.status = body.status;
    data.completedAt = body.status === "done" ? new Date() : null;
  }
  if (typeof body.priority === "string") data.priority = body.priority;
  if (body.projectId !== undefined) data.projectId = body.projectId ?? null;
  if (typeof body.position === "number" && Number.isFinite(body.position)) {
    data.position = body.position;
  }

  const result = await prisma.task.updateMany({
    where: { id, userId: session.user.id },
    data,
  });

  if (result.count === 0) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const task = await prisma.task.findUnique({
    where: { id },
    include: { project: { select: { id: true, code: true, title: true } } },
  });
  return Response.json(task);
}

// DELETE /api/tasks/[id]
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  await prisma.task.deleteMany({
    where: { id, userId: session.user.id },
  });

  return Response.json({ ok: true });
}
