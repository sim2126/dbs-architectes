import { NextRequest } from "next/server";
import { prisma } from "@/platform/db";
import { authorize, loadSubject } from "@/platform/authz";
import { resolveChannelAccess } from "@/features/chat/server/channel-access";
import { pusherServer, channelName, PUSHER_EVENTS } from "@/platform/integrations/pusher";
import { channelInvalidation } from "@/features/chat/domain/realtime";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const subject = await loadSubject();
  if (!subject) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const readDecision = authorize(subject, "chat:read", null);
  if (!readDecision.allow) {
    return Response.json({ error: readDecision.reason }, { status: 403 });
  }

  const { id } = await params;
  const body = (await request.json().catch(() => null)) as { content?: unknown } | null;
  if (typeof body?.content !== "string") {
    return Response.json({ error: "content is required" }, { status: 400 });
  }
  const content = body.content.trim();
  if (!content || content.length > 20_000) {
    return Response.json(
      { error: "Message content must be between 1 and 20,000 characters." },
      { status: 400 },
    );
  }
  const message = await prisma.message.findFirst({ where: { id, deletedAt: null } });

  if (!message) return Response.json({ error: "Not found" }, { status: 404 });
  const access = await resolveChannelAccess(message.channelId, subject);
  if (!access.ok) return Response.json({ error: access.error }, { status: access.status });
  const decision = authorize(subject, "chat:message.update", {
    kind: "chat",
    channelId: message.channelId,
    messageUserId: message.userId,
  });
  if (!decision.allow) return Response.json({ error: decision.reason }, { status: 403 });

  const updated = await prisma.message.update({
    where: { id },
    data: { content, editedAt: new Date() },
    include: {
      user: { select: { id: true, name: true, initials: true, image: true, isExternal: true } },
      reactions: { include: { user: { select: { id: true, name: true, initials: true, isExternal: true } } } },
      replies: {
        where: { deletedAt: null },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 5,
        include: {
          user: { select: { id: true, name: true, initials: true, image: true, isExternal: true } },
          reactions: { include: { user: { select: { id: true, name: true, initials: true, isExternal: true } } } },
        },
      },
      _count: { select: { replies: { where: { deletedAt: null } } } },
    },
  });

  try {
    await pusherServer.trigger(
      channelName(message.channelId),
      PUSHER_EVENTS.EDIT_MESSAGE,
      channelInvalidation(message.channelId),
    );
  } catch (error) {
    console.warn("[chat] real-time edit delivery failed", error);
  }
  const { _count, ...payload } = updated;
  return Response.json({
    ...payload,
    replies: [...payload.replies].reverse(),
    replyCount: _count.replies,
  });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const subject = await loadSubject();
  if (!subject) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const readDecision = authorize(subject, "chat:read", null);
  if (!readDecision.allow) {
    return Response.json({ error: readDecision.reason }, { status: 403 });
  }

  const { id } = await params;
  const message = await prisma.message.findUnique({ where: { id } });
  if (!message) return Response.json({ error: "Not found" }, { status: 404 });

  const access = await resolveChannelAccess(message.channelId, subject);
  if (!access.ok) return Response.json({ error: access.error }, { status: access.status });
  const decision = authorize(subject, "chat:message.delete", {
    kind: "chat",
    channelId: message.channelId,
    messageUserId: message.userId,
  });
  if (!decision.allow) return Response.json({ error: decision.reason }, { status: 403 });

  await prisma.message.update({
    where: { id },
    data: {
      deletedAt: message.deletedAt ?? new Date(),
      content: "This message was deleted.",
      fileUrl: null,
      fileName: null,
    },
  });

  try {
    await pusherServer.trigger(
      channelName(message.channelId),
      PUSHER_EVENTS.DELETE_MESSAGE,
      channelInvalidation(message.channelId),
    );
  } catch (error) {
    console.warn("[chat] real-time delete delivery failed", error);
  }

  return Response.json({ success: true });
}
