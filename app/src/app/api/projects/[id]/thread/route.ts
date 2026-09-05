import { NextRequest } from "next/server";
import { prisma } from "@/platform/db";
import {
  loadProjectForAuth,
  PermissionError,
  permissionResponse,
  requirePermission,
  type Subject,
} from "@/platform/authz";
import { resolveChannelAccess } from "@/features/chat/server/channel-access";
import {
  decodeMessageCursor,
  encodeMessageCursor,
} from "@/features/chat/domain/message-cursor";
import { rateLimit, rateLimitedResponse } from "@/platform/auth/rate-limit";
import { channelInvalidation } from "@/features/chat/domain/realtime";
import { channelName, PUSHER_EVENTS, pusherServer } from "@/platform/integrations/pusher";
import { notifyMessagePosted } from "@/features/notifications/server/producers";
import { announceProjectChange } from "@/features/projects/server/announce-project-change";

function boundedLimit(value: string | null, fallback = 50, max = 100) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.floor(parsed), max);
}

// Lazy-get/create the channel for this project. Always called AFTER
// requirePermission() has approved the action, so the membership upsert
// is only triggered for callers who already have access.
async function getOrCreateThreadChannel(projectId: string, userId: string) {
  const channel = await prisma.channel.upsert({
    where: { projectId_type: { projectId, type: "project" } },
    create: {
      name: `project-${projectId}`,
      type: "project",
      projectId,
      createdBy: userId,
    },
    update: {},
  });

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
  const decodedCursor = decodeMessageCursor(cursor);
  if (cursor && !decodedCursor) {
    return Response.json({ error: "Invalid cursor" }, { status: 400 });
  }

  let subject: Subject;
  try {
    const { subject: grantedSubject, resource } = await requirePermission(request, "thread:read", {
      loadResource: (s) => loadProjectForAuth(id, s.userId),
      context: { route: `GET /api/projects/${id}/thread` },
    });
    if (!resource) return Response.json({ error: "Not found" }, { status: 404 });
    subject = grantedSubject;
  } catch (e) {
    if (e instanceof PermissionError) return permissionResponse(e);
    throw e;
  }

  const channel = await getOrCreateThreadChannel(id, subject.userId);
  const access = await resolveChannelAccess(channel.id, subject);
  if (!access.ok) return Response.json({ error: access.error }, { status: access.status });

  const messages = await prisma.message.findMany({
    where: {
      channelId: channel.id,
      parentId: null,
      AND: [
        {
          OR: [
            { deletedAt: null },
            { replies: { some: { deletedAt: null } } },
          ],
        },
        ...(decodedCursor
          ? [{
              OR: [
                { createdAt: { lt: decodedCursor.createdAt } },
                {
                  createdAt: decodedCursor.createdAt,
                  id: { lt: decodedCursor.id },
                },
              ],
            }]
          : []),
      ],
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    include: {
      user: { select: { id: true, name: true, initials: true, image: true, role: true } },
      replies: {
        where: { deletedAt: null },
        orderBy: { createdAt: "asc" },
        include: {
          user: { select: { id: true, name: true, initials: true, image: true, role: true } },
        },
      },
      reactions: {
        include: { user: { select: { id: true, name: true, initials: true } } },
      },
    },
    take: limit + 1,
  });
  const hasMore = messages.length > limit;
  const page = hasMore ? messages.slice(0, limit) : messages;
  const last = hasMore ? page.at(-1) : null;
  const nextCursor = last
    ? encodeMessageCursor({ createdAt: last.createdAt, id: last.id })
    : null;

  return Response.json({ channelId: channel.id, messages: page.reverse(), hasMore, nextCursor });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  let subject: Subject;
  try {
    const { subject: grantedSubject, resource } = await requirePermission(request, "thread:post", {
      loadResource: (s) => loadProjectForAuth(id, s.userId),
      context: { route: `POST /api/projects/${id}/thread` },
    });
    if (!resource) return Response.json({ error: "Not found" }, { status: 404 });
    subject = grantedSubject;
  } catch (e) {
    if (e instanceof PermissionError) return permissionResponse(e);
    throw e;
  }

  const postLimit = rateLimit(subject.userId, {
    key: "project-thread-post",
    limit: 60,
    windowMs: 60_000,
  });
  if (!postLimit.allowed) {
    return rateLimitedResponse(
      postLimit.retryAfterMs,
      "You're sending updates too quickly. Please wait a moment.",
    );
  }

  const body = (await request.json().catch(() => null)) as {
    content?: unknown;
    parentId?: unknown;
  } | null;
  if (typeof body?.content !== "string") {
    return Response.json({ error: "Empty message" }, { status: 400 });
  }
  const content = body.content.trim();
  if (!content || content.length > 20_000) {
    return Response.json(
      { error: "Message content must be between 1 and 20,000 characters." },
      { status: 400 },
    );
  }
  const parentId = body.parentId;
  if (parentId !== undefined && parentId !== null && typeof parentId !== "string") {
    return Response.json({ error: "Invalid parent message" }, { status: 400 });
  }

  const channel = await getOrCreateThreadChannel(id, subject.userId);
  const access = await resolveChannelAccess(channel.id, subject);
  if (!access.ok) return Response.json({ error: access.error }, { status: access.status });

  let parentAuthorId: string | null = null;
  if (parentId) {
    const parent = await prisma.message.findUnique({
      where: { id: parentId },
      select: { channelId: true, parentId: true, deletedAt: true, userId: true },
    });
    if (
      !parent ||
      parent.channelId !== channel.id ||
      parent.parentId !== null ||
      parent.deletedAt !== null
    ) {
      return Response.json({ error: "Thread not found in this project" }, { status: 400 });
    }
    parentAuthorId = parent.userId;
  }

  const message = await prisma.message.create({
    data: {
      channelId: channel.id,
      userId:    subject.userId,
      content,
      parentId:  parentId ?? null,
    },
    include: {
      user: { select: { id: true, name: true, initials: true, image: true, role: true } },
      replies: { where: { deletedAt: null } },
      reactions: true,
    },
  });

  try {
    await pusherServer.trigger(
      channelName(channel.id),
      PUSHER_EVENTS.NEW_MESSAGE,
      channelInvalidation(channel.id),
    );
  } catch { /* Pusher unavailable — non-fatal */ }

  await announceProjectChange(id);
  try {
    await notifyMessagePosted({ messageId: message.id, channelId: channel.id, content, actorId: subject.userId, parentAuthorId });
  } catch (error) {
    console.warn("[project thread] notifications failed", error);
  }

  return Response.json(message);
}
