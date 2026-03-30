import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { pusherServer, channelName, PUSHER_EVENTS } from "@/lib/pusher";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const channelId = searchParams.get("channelId");
  const cursor = searchParams.get("cursor");
  const limit = 50;

  if (!channelId) return Response.json({ error: "channelId required" }, { status: 400 });

  const messages = await prisma.message.findMany({
    where: {
      channelId,
      parentId: null,
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

  // Update last read
  await prisma.channelMember.upsert({
    where: { channelId_userId: { channelId, userId: session.user.id } },
    update: { lastRead: new Date() },
    create: { channelId, userId: session.user.id, lastRead: new Date() },
  });

  return Response.json({
    messages: messages.reverse(),
    hasMore: messages.length === limit,
    nextCursor: messages[0]?.createdAt.toISOString(),
  });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { channelId, content, parentId, type = "text" } = body;

  if (!channelId || !content?.trim()) {
    return Response.json({ error: "channelId and content required" }, { status: 400 });
  }

  const message = await prisma.message.create({
    data: {
      channelId,
      userId: session.user.id,
      content: content.trim(),
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

  // Push real-time event
  await pusherServer.trigger(
    channelName(channelId),
    PUSHER_EVENTS.NEW_MESSAGE,
    message
  );

  return Response.json(message);
}
