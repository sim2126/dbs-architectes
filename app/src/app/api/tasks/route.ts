import { NextRequest } from "next/server";
import { auth } from "@/platform/auth";
import { prisma } from "@/platform/db";
import { pendoTrack } from "@/platform/integrations/pendo-track";

// GET /api/tasks — every personal task for the current user
//   ?status=todo|doing|done   optional filter
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") || undefined;

  const tasks = await prisma.task.findMany({
    where: {
      userId: session.user.id,
      ...(status ? { status } : {}),
    },
    orderBy: [{ status: "asc" }, { position: "asc" }, { createdAt: "asc" }],
    include: {
      project: { select: { id: true, code: true, title: true } },
    },
  });

  return Response.json(tasks);
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
  const last = await prisma.task.findFirst({
    where: { userId: session.user.id, status: "todo" },
    orderBy: { position: "desc" },
    select: { position: true },
  });

  const task = await prisma.task.create({
    data: {
      userId: session.user.id,
      title: body.title.trim().slice(0, 500),
      description: body.description?.slice(0, 5000) ?? null,
      dueDate: body.dueDate ? new Date(body.dueDate) : null,
      priority: body.priority ?? "medium",
      projectId: body.projectId ?? null,
      position: (last?.position ?? 0) + 1,
    },
    include: {
      project: { select: { id: true, code: true, title: true } },
    },
  });

  pendoTrack("task_created", {
    visitorId: session.user.id,
    properties: {
      task_id: task.id,
      priority: task.priority,
      has_due_date: Boolean(body.dueDate),
      has_project_link: Boolean(body.projectId),
      project_id: body.projectId ?? "",
    },
  });

  return Response.json(task);
}
