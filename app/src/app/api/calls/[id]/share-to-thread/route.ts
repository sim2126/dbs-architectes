import { NextRequest } from "next/server";
import { auth } from "@/platform/auth";
import { prisma } from "@/platform/db";
import { pusherServer, PUSHER_EVENTS, channelName } from "@/platform/integrations/pusher";
import { pendoTrack } from "@/platform/integrations/pendo-track";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { channelId } = (await request.json()) as { channelId?: string };

  const call = await prisma.call.findUnique({ where: { id }, include: { project: true } });
  if (!call?.shareToken) {
    return Response.json({ error: "Summary not yet generated" }, { status: 400 });
  }

  // Default to project's main channel if not specified
  let targetChannelId = channelId;
  if (!targetChannelId && call.projectId) {
    const ch = await prisma.channel.findFirst({
      where: { projectId: call.projectId },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    targetChannelId = ch?.id;
  }
  if (!targetChannelId) {
    return Response.json({ error: "No target channel" }, { status: 400 });
  }

  const origin = request.nextUrl.origin;
  const shareUrl = `${origin}/s/meeting/${call.shareToken}`;
  const title = call.title ?? "Team Meeting";
  const projectTag = call.project ? ` · ${call.project.code}` : "";
  const content = `📝 **Meeting summary**${projectTag} — ${title}\n${shareUrl}`;

  const message = await prisma.message.create({
    data: {
      channelId: targetChannelId,
      userId: session.user.id,
      content,
      type: "text",
    },
    include: {
      user: { select: { id: true, name: true, initials: true, image: true } },
    },
  });

  try {
    await pusherServer.trigger(channelName(targetChannelId), PUSHER_EVENTS.NEW_MESSAGE, message);
  } catch {
    // non-fatal
  }

  pendoTrack("call_summary_shared_to_thread", {
    visitorId: session.user.id,
    properties: {
      call_id: id,
      channel_id: targetChannelId,
      project_id: call.projectId ?? "",
    },
  });

  return Response.json({ success: true, shareUrl, channelId: targetChannelId });
}
