import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { pusherServer, channelName, PUSHER_EVENTS } from "@/lib/pusher";

// ── Access check ──────────────────────────────────────────────────────────────
// Public channels: any authenticated user can read/write.
// Project channels: any authenticated user can read (project threads are
//   access-controlled at the /api/projects/[id]/thread level).
// Private / direct channels: caller must be a ChannelMember row.

async function assertChannelAccess(channelId: string, userId: string) {
  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    select: {
      type: true,
      members: { where: { userId }, select: { userId: true } },
    },
  });

  if (!channel) return { ok: false, status: 404, error: "Channel not found" } as const;

  if (channel.type === "public") return { ok: true } as const;

  if (channel.members.length === 0) {
    return { ok: false, status: 403, error: "Forbidden" } as const;
  }

  return { ok: true } as const;
}

// ── GET /api/chat/messages ────────────────────────────────────────────────────
// ?channelId=  — standard paginated message fetch
// ?mention=    — search all accessible channels for messages mentioning that name

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const channelId = searchParams.get("channelId");
  const mention   = searchParams.get("mention");
  const cursor    = searchParams.get("cursor");
  const limit     = 50;

  // ── Mention search mode ───────────────────────────────────────────────────
  if (mention) {
    const messages = await prisma.message.findMany({
      where: {
        content:   { contains: `@${mention}`, mode: "insensitive" },
        deletedAt: null,
        // Only from channels the calling user can access
        channel: {
          OR: [
            { type: "public" },
            { type: "project" },
            { members: { some: { userId: session.user.id } } },
          ],
        },
      },
      orderBy: { createdAt: "desc" },
      take: 30,
      include: {
        user: { select: { id: true, name: true, initials: true, image: true } },
        channel: { select: { id: true, name: true } },
      },
    });

    return Response.json(
      messages.map((m) => ({
        id:          m.id,
        content:     m.content,
        createdAt:   m.createdAt,
        channelId:   m.channelId,
        channelName: m.channel.name,
        user:        m.user,
      }))
    );
  }

  // ── Standard channel message fetch ────────────────────────────────────────
  if (!channelId) return Response.json({ error: "channelId required" }, { status: 400 });

  const access = await assertChannelAccess(channelId, session.user.id);
  if (!access.ok) return Response.json({ error: access.error }, { status: access.status });

  const messages = await prisma.message.findMany({
    where: {
      channelId,
      parentId:  null,
      deletedAt: null,
      ...(cursor ? { createdAt: { lt: new Date(cursor) } } : {}),
    },
    include: {
      user: { select: { id: true, name: true, initials: true, image: true, role: true } },
      reactions: {
        include: { user: { select: { id: true, name: true, initials: true } } },
      },
      replies: {
        where: { deletedAt: null },
        include: {
          user: { select: { id: true, name: true, initials: true, image: true } },
          reactions: { include: { user: { select: { id: true, name: true, initials: true } } } },
        },
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  // Update last-read timestamp (only for actual members of private/direct channels)
  const channelType = (await prisma.channel.findUnique({ where: { id: channelId }, select: { type: true } }))?.type;
  if (channelType !== "public") {
    await prisma.channelMember.updateMany({
      where: { channelId, userId: session.user.id },
      data: { lastRead: new Date() },
    });
  }

  return Response.json({
    messages: messages.reverse(),
    hasMore:  messages.length === limit,
    nextCursor: messages[0]?.createdAt.toISOString(),
  });
}

// ── POST /api/chat/messages ───────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { channelId, content, parentId, type = "text" } = body;

  if (!channelId || !content?.trim()) {
    return Response.json({ error: "channelId and content required" }, { status: 400 });
  }

  // Enforce membership before allowing writes
  const access = await assertChannelAccess(channelId, session.user.id);
  if (!access.ok) return Response.json({ error: access.error }, { status: access.status });

  const message = await prisma.message.create({
    data: {
      channelId,
      userId:   session.user.id,
      content:  content.trim(),
      type,
      parentId: parentId ?? null,
    },
    include: {
      user: { select: { id: true, name: true, initials: true, image: true, role: true } },
      reactions: { include: { user: { select: { id: true, name: true, initials: true } } } },
      replies: {
        include: { user: { select: { id: true, name: true, initials: true, image: true } } },
      },
    },
  });

  await pusherServer.trigger(channelName(channelId), PUSHER_EVENTS.NEW_MESSAGE, message);

  return Response.json(message);
}
