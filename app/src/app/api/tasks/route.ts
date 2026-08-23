import { NextRequest } from "next/server";
import { auth } from "@/platform/auth";
import { prisma } from "@/platform/db";
import { personalTaskWorkItemWhere, toLegacyTask } from "@/features/work-items";
import { resolveChannelAccess } from "@/features/chat/server/channel-access";

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
    sourceMessageId?: string;
  };

  if (!body.title || body.title.trim().length === 0) {
    return Response.json({ error: "title is required" }, { status: 400 });
  }

  const sourceMessage = body.sourceMessageId
    ? await prisma.message.findUnique({
        where: { id: body.sourceMessageId },
        select: {
          id: true,
          content: true,
          channelId: true,
          channel: { select: { projectId: true } },
        },
      })
    : null;

  if (body.sourceMessageId && !sourceMessage) {
    return Response.json({ error: "Source thread not found" }, { status: 404 });
  }
  if (sourceMessage) {
    const access = await resolveChannelAccess(sourceMessage.channelId, {
      userId: session.user.id,
      isExternal: session.user.isExternal,
    });
    if (!access.ok) {
      return Response.json({ error: access.error }, { status: access.status });
    }

    const existing = await prisma.workItem.findFirst({
      where: {
        userId: session.user.id,
        sourceSystem: "chat-thread",
        sourceId: sourceMessage.id,
      },
      include: {
        project: { select: { id: true, code: true, title: true } },
      },
    });
    if (existing) {
      return Response.json({ ...toLegacyTask(existing), project: existing.project });
    }
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
  const sourceLink = sourceMessage
    ? `/dashboard/chat?channel=${encodeURIComponent(sourceMessage.channelId)}&thread=${encodeURIComponent(sourceMessage.id)}`
    : null;
  const description = sourceMessage
    ? `${sourceMessage.content}\n\nSource conversation: ${sourceLink}`.slice(0, 5000)
    : body.description?.slice(0, 5000) ?? null;

  let task;
  try {
    task = await prisma.workItem.create({
      data: {
        id,
        legacyTaskId: id,
        userId: session.user.id,
        title: body.title.trim().slice(0, 500),
        description,
        dueDate: body.dueDate ? new Date(body.dueDate) : null,
        priority: body.priority ?? "medium",
        projectId: sourceMessage?.channel.projectId ?? body.projectId ?? null,
        position: (last?.position ?? 0) + 1,
        type: "task",
        sourceSystem: sourceMessage ? "chat-thread" : null,
        sourceId: sourceMessage?.id ?? null,
      },
      include: {
        project: { select: { id: true, code: true, title: true } },
      },
    });
  } catch (error) {
    if (
      sourceMessage &&
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2002"
    ) {
      const existing = await prisma.workItem.findFirst({
        where: {
          userId: session.user.id,
          sourceSystem: "chat-thread",
          sourceId: sourceMessage.id,
        },
        include: {
          project: { select: { id: true, code: true, title: true } },
        },
      });
      if (existing) {
        return Response.json({ ...toLegacyTask(existing), project: existing.project });
      }
    }
    throw error;
  }

  return Response.json({
    ...toLegacyTask(task),
    project: task.project,
  });
}
