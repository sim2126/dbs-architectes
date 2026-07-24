import { NextRequest } from "next/server";
import { auth } from "@/platform/auth";
import { prisma } from "@/platform/db";
import { personalTaskWorkItemWhere, toLegacyTask } from "@/features/work-items";

// GET /api/tasks — every personal task for the current user
//   ?status=todo|doing|done   optional filter
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") || undefined;

  const tasks = await prisma.workItem.findMany({
    where: {
      userId: session.user.id,
      ...personalTaskWorkItemWhere,
      ...(status ? { status } : {}),
    },
    orderBy: [{ status: "asc" }, { position: "asc" }, { createdAt: "asc" }],
    include: {
      project: { select: { id: true, code: true, title: true } },
    },
  });

  return Response.json(
    tasks.map((task) => ({
      ...toLegacyTask(task),
      project: task.project,
    })),
  );
}

// POST /api/tasks — create a new task
//   body: { title, description?, dueDate?, priority?, projectId? }
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as {
    title?: string;
    description?: string;
    dueDate?: string;
    priority?: string;
    projectId?: string;
  };

  if (!body.title || body.title.trim().length === 0) {
    return Response.json({ error: "title is required" }, { status: 400 });
  }

  // New task lands at the bottom of the todo column (largest position + 1).
  const last = await prisma.workItem.findFirst({
    where: {
      userId: session.user.id,
      status: "todo",
      ...personalTaskWorkItemWhere,
    },
    orderBy: { position: "desc" },
    select: { position: true },
  });

  const id = crypto.randomUUID();
  const task = await prisma.workItem.create({
    data: {
      id,
      legacyTaskId: id,
      userId: session.user.id,
      title: body.title.trim().slice(0, 500),
      description: body.description?.slice(0, 5000) ?? null,
      dueDate: body.dueDate ? new Date(body.dueDate) : null,
      priority: body.priority ?? "medium",
      projectId: body.projectId ?? null,
      position: (last?.position ?? 0) + 1,
      type: "task",
    },
    include: {
      project: { select: { id: true, code: true, title: true } },
    },
  });

  return Response.json({
    ...toLegacyTask(task),
    project: task.project,
  });
}
