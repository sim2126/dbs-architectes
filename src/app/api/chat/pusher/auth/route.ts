import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { pusherServer } from "@/lib/pusher";

// Channels open to all authenticated users:
const OPEN_PRIVATE_CHANNELS = new Set(["private-global-notifications"]);

// Extracts the channelId from "private-channel-{channelId}"
function extractChannelId(channelName: string): string | null {
  const prefix = "private-channel-";
  return channelName.startsWith(prefix) ? channelName.slice(prefix.length) : null;
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session) return new Response("Unauthorized", { status: 401 });

  const body      = await request.text();
  const params    = new URLSearchParams(body);
  const socketId  = params.get("socket_id")!;
  const channel   = params.get("channel_name")!;

  // ── Presence channels (workspace-wide) ───────────────────────────────────
  if (channel.startsWith("presence-")) {
    const authResponse = pusherServer.authorizeChannel(socketId, channel, {
      user_id: session.user.id,
      user_info: {
        name:     session.user.name,
        initials: (session.user as { initials?: string }).initials ?? session.user.name?.slice(0, 2).toUpperCase(),
        image:    session.user.image,
      },
    });
    return Response.json(authResponse);
  }

  // ── Open private channels (browser notifications, etc.) ──────────────────
  if (OPEN_PRIVATE_CHANNELS.has(channel)) {
    return Response.json(pusherServer.authorizeChannel(socketId, channel));
  }

  // ── Per-channel private subscriptions ────────────────────────────────────
  if (channel.startsWith("private-channel-")) {
    const channelId = extractChannelId(channel);

    if (!channelId) return new Response("Bad channel name", { status: 400 });

    // Verify the user is a member of this channel
    const channelRecord = await prisma.channel.findUnique({
      where: { id: channelId },
      select: {
        type:    true,
        members: { where: { userId: session.user.id }, select: { userId: true } },
      },
    });

    if (!channelRecord) return new Response("Channel not found", { status: 404 });

    // Public channels allow any authenticated user to subscribe
    const isMember =
      channelRecord.type === "public" ||
      channelRecord.type === "project" ||
      channelRecord.members.length > 0;

    if (!isMember) return new Response("Forbidden", { status: 403 });

    return Response.json(pusherServer.authorizeChannel(socketId, channel));
  }

  // Deny anything else we don't recognise
  return new Response("Forbidden", { status: 403 });
}
