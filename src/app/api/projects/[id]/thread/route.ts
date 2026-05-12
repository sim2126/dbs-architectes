import { NextRequest } from "next/server";
import { prisma } from "@/platform/db";
import {
  loadProjectForAuth,
  PermissionError,
  permissionResponse,
  requirePermission,
} from "@/platform/authz";

function boundedLimit(value: string | null, fallback = 50, max = 100) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.floor(parsed), max);
}

// Lazy-get/create the channel for this project. Always called AFTER
// requirePermission() has approved the action, so the membership upsert
// is only triggered for callers who already have access.
async function getOrCreateThreadChannel(projectId: string, userId: string) {
  let channel = await prisma.channel.findFirst({
    where: { projectId, type: "project" },
  });

  if (!channel) {
    channel = await prisma.channel.create({
      data: {
        name:      `project-${projectId}`,
        type:      "project",
        projectId,
        createdBy: userId,
      },
    });
  }

  await prisma.channelMember.upsert({
    where:  { channelId_userId: { channelId: channel.id, userId } },
    create: { channelId: channel.id, userId },
    update: {},
  });

  return channel;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const cursor = searchParams.get("cursor") || "";
  const limit = boundedLimit(searchParams.get("limit"));

  let subjectUserId: string;
  try {
    const { subject, resource } = await requirePermission(request, "thread:read", {
      loadResource: (s) => loadProjectForAuth(id, s.userId),
      context: { route: `GET /api/projects/${id}/thread` },
    });
    if (!resource) return Response.json({ error: "Not found" }, { status: 404 });
    subjectUserId = subject.userId;
  } catch (e) {
    if (e instanceof PermissionError) return permissionResponse(e);
    throw e;
  }

  const channel = await getOrCreateThreadChannel(id, subjectUserId);

  const messages = await prisma.message.findMany({
    where: {
      channelId: channel.id,
      deletedAt: null,
      parentId: null,
      ...(cursor ? { createdAt: { lt: new Date(cursor) } } : {}),
    },
    orderBy: { createdAt: "desc" },
    include: {
      user: { select: { id: true, name: true, initials: true, image: true, role: true } },
      replies: {
        where: { deletedAt: null },
        orderBy: { createdAt: "asc" },
        include: {
          user: { select: { id: true, name: true, initials: true, image: true, role: true } },
        },
        take: 5,
      },
      reactions: {
        include: { user: { select: { id: true, name: true, initials: true } } },
      },
    },
    take: limit + 1,
  });
  const hasMore = messages.length > limit;
  const page = hasMore ? messages.slice(0, limit) : messages;
  const nextCursor = hasMore ? page.at(-1)?.createdAt.toISOString() ?? null : null;

  return Response.json({ channelId: channel.id, messages: page.reverse(), hasMore, nextCursor });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  let subjectUserId: string;
  try {
    const { subject, resource } = await requirePermission(request, "thread:post", {
      loadResource: (s) => loadProjectForAuth(id, s.userId),
      context: { route: `POST /api/projects/${id}/thread` },
    });
    if (!resource) return Response.json({ error: "Not found" }, { status: 404 });
    subjectUserId = subject.userId;
  } catch (e) {
    if (e instanceof PermissionError) return permissionResponse(e);
    throw e;
  }

  const { content, parentId } = await request.json();
  if (!content?.trim()) return Response.json({ error: "Empty message" }, { status: 400 });

  const channel = await getOrCreateThreadChannel(id, subjectUserId);

  const message = await prisma.message.create({
    data: {
      channelId: channel.id,
      userId:    subjectUserId,
      content:   content.trim(),
      parentId:  parentId ?? null,
    },
    include: {
      user: { select: { id: true, name: true, initials: true, image: true, role: true } },
      replies: { where: { deletedAt: null } },
      reactions: true,
    },
  });

  try {
    const { default: Pusher } = await import("pusher");
    if (process.env.PUSHER_APP_ID) {
      const pusher = new Pusher({
        appId:   process.env.PUSHER_APP_ID!,
        key:     process.env.NEXT_PUBLIC_PUSHER_KEY!,
        secret:  process.env.PUSHER_SECRET!,
        cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER!,
      });
      await pusher.trigger(`project-thread-${id}`, "new-message", message);
    }
  } catch { /* Pusher unavailable — non-fatal */ }

  return Response.json(message);
}
