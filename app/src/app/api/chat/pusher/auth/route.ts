import { NextRequest } from "next/server";
import { prisma } from "@/platform/db";
import { authorize, loadSubject } from "@/platform/authz";
import { resolveChannelAccess } from "@/features/chat/server/channel-access";
import { pusherServer } from "@/platform/integrations/pusher";

// Channels open to all authenticated users:
const OPEN_PRIVATE_CHANNELS = new Set(["private-global-notifications"]);
const PRESENCE_CHANNELS = new Set(["presence-workspace"]);

// Extracts the channelId from "private-channel-{channelId}"
function extractChannelId(channelName: string): string | null {
  const prefix = "private-channel-";
  return channelName.startsWith(prefix) ? channelName.slice(prefix.length) : null;
}

export async function POST(request: NextRequest) {
  const subject = await loadSubject();
  if (!subject) return new Response("Unauthorized", { status: 401 });

  const body      = await request.text();
  const params    = new URLSearchParams(body);
  const socketId  = params.get("socket_id");
  const channel   = params.get("channel_name");
  if (!socketId || !channel) {
    return new Response("Missing socket or channel", { status: 400 });
  }

  // ── Presence channels (workspace-wide) ───────────────────────────────────
  if (PRESENCE_CHANNELS.has(channel)) {
    if (subject.isExternal) return new Response("Forbidden", { status: 403 });
    const user = await prisma.user.findUnique({
      where: { id: subject.userId },
      select: { name: true, initials: true, image: true },
    });
    if (!user) return new Response("Unauthorized", { status: 401 });
    const authResponse = pusherServer.authorizeChannel(socketId, channel, {
      user_id: subject.userId,
      user_info: {
        name:     user.name,
        initials: user.initials ?? user.name?.slice(0, 2).toUpperCase(),
        image:    user.image,
      },
    });
    return Response.json(authResponse);
  }

  // ── Open private channels (browser notifications, etc.) ──────────────────
  if (OPEN_PRIVATE_CHANNELS.has(channel)) {
    if (subject.isExternal) return new Response("Forbidden", { status: 403 });
    return Response.json(pusherServer.authorizeChannel(socketId, channel));
  }

  // ── Per-channel private subscriptions ────────────────────────────────────
  if (channel.startsWith("private-channel-")) {
    const channelId = extractChannelId(channel);

    if (!channelId) return new Response("Bad channel name", { status: 400 });

    const readDecision = authorize(subject, "chat:read", null);
    if (!readDecision.allow) return new Response(readDecision.reason, { status: 403 });

    const access = await resolveChannelAccess(channelId, subject);
    if (!access.ok) return new Response(access.error, { status: access.status });

    return Response.json(pusherServer.authorizeChannel(socketId, channel));
  }

  // Deny anything else we don't recognise
  return new Response("Forbidden", { status: 403 });
}
