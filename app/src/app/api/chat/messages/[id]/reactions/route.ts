import { NextRequest } from "next/server";
import { prisma } from "@/platform/db";
import { authorize, loadSubject } from "@/platform/authz";
import { pusherServer, channelName, PUSHER_EVENTS } from "@/platform/integrations/pusher";
import { resolveChannelAccess } from "@/features/chat/server/channel-access";
import { rateLimit, rateLimitedResponse } from "@/platform/auth/rate-limit";
import { channelInvalidation } from "@/features/chat/domain/realtime";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const subject = await loadSubject();
  if (!subject) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const readDecision = authorize(subject, "chat:read", null);
  if (!readDecision.allow) {
    return Response.json({ error: readDecision.reason }, { status: 403 });
  }
  const reactionDecision = authorize(subject, "chat:react", null);
  if (!reactionDecision.allow) {
    return Response.json({ error: reactionDecision.reason }, { status: 403 });
  }
  const reactionLimit = rateLimit(subject.userId, {
    key: "chat-reaction",
    limit: 120,
    windowMs: 60_000,
  });
  if (!reactionLimit.allowed) {
    return rateLimitedResponse(
      reactionLimit.retryAfterMs,
      "You're reacting too quickly. Please wait a moment.",
    );
  }

  const { id } = await params;
  const body = (await request.json().catch(() => null)) as { emoji?: unknown } | null;
  if (typeof body?.emoji !== "string" || !body.emoji.trim() || body.emoji.length > 64) {
    return Response.json({ error: "A valid reaction is required" }, { status: 400 });
  }
  const emoji = body.emoji;
  const message = await prisma.message.findFirst({ where: { id, deletedAt: null } });
  if (!message) return Response.json({ error: "Not found" }, { status: 404 });
  const access = await resolveChannelAccess(message.channelId, subject);
  if (!access.ok) return Response.json({ error: access.error }, { status: access.status });

  const existing = await prisma.messageReaction.findUnique({
    where: { messageId_userId_emoji: { messageId: id, userId: subject.userId, emoji } },
  });

  let event: string;
  if (existing) {
    await prisma.messageReaction.delete({ where: { id: existing.id } });
    event = PUSHER_EVENTS.REACTION_REMOVE;
  } else {
    await prisma.messageReaction.create({
      data: { messageId: id, userId: subject.userId, emoji },
      include: { user: { select: { id: true, name: true, initials: true } } },
    });
    event = PUSHER_EVENTS.REACTION_ADD;
  }

  try {
    await pusherServer.trigger(
      channelName(message.channelId),
      event,
      channelInvalidation(message.channelId),
    );
  } catch (error) {
    console.warn("[chat] real-time reaction delivery failed", error);
  }
  return Response.json({ toggled: !existing });
}
