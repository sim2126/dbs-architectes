import { NextRequest } from "next/server";
import { authorize, loadSubject } from "@/platform/authz";
import { prisma } from "@/platform/db";
import { pusherServer, PUSHER_EVENTS, channelName } from "@/platform/integrations/pusher";
import { canAccessCall } from "@/features/calls/server/call-access";
import { resolveChannelAccess } from "@/features/chat/server/channel-access";
import { channelInvalidation } from "@/features/chat/domain/realtime";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const subject = await loadSubject();
  if (!subject) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const readDecision = authorize(subject, "chat:read", null);
  const postDecision = authorize(subject, "chat:post", null);
  if (!readDecision.allow) {
    return Response.json({ error: readDecision.reason }, { status: 403 });
  }
  if (!postDecision.allow) {
    return Response.json({ error: postDecision.reason }, { status: 403 });
  }

  const { id } = await params;
  const body = (await request.json().catch(() => null)) as { channelId?: unknown } | null;
  if (body?.channelId !== undefined && typeof body.channelId !== "string") {
    return Response.json({ error: "Invalid target channel" }, { status: 400 });
  }

  const call = await prisma.call.findUnique({ where: { id }, include: { project: true } });
  if (
    !(await canAccessCall({
      callId: id,
      userId: subject.userId,
      role: subject.role,
    }))
  ) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  if (!call?.shareToken) {
    return Response.json({ error: "Summary not yet generated" }, { status: 400 });
  }

  let targetChannelId = body?.channelId;
  if (!targetChannelId && call.projectId) {
    const channel = await prisma.channel.findFirst({
      where: { projectId: call.projectId },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    targetChannelId = channel?.id;
  }
  if (!targetChannelId) {
    return Response.json({ error: "No target channel" }, { status: 400 });
  }
  const channelAccess = await resolveChannelAccess(targetChannelId, subject);
  if (!channelAccess.ok) {
    return Response.json({ error: channelAccess.error }, { status: channelAccess.status });
  }

  const origin = request.nextUrl.origin;
  const shareUrl = `${origin}/s/meeting/${call.shareToken}`;
  const title = call.title ?? "Team meeting";
  const projectTag = call.project ? ` · ${call.project.code}` : "";
  const content = `**Meeting summary**${projectTag} — ${title}\n${shareUrl}`;

  await prisma.message.create({
    data: {
      channelId: targetChannelId,
      userId: subject.userId,
      content,
      type: "text",
    },
  });

  try {
    await pusherServer.trigger(
      channelName(targetChannelId),
      PUSHER_EVENTS.NEW_MESSAGE,
      channelInvalidation(targetChannelId),
    );
  } catch {
    // The database write remains authoritative when real-time delivery is down.
  }

  return Response.json({ success: true, shareUrl, channelId: targetChannelId });
}
