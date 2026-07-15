import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { auth } from "@/platform/auth";
import { prisma } from "@/platform/db";
import { pendoTrack } from "@/platform/integrations/pendo";

export async function GET() {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const channels = await prisma.channel.findMany({
    where: {
      OR: [
        { type: "public" },
        { members: { some: { userId: session.user.id } } },
      ],
    },
    include: {
      members: { include: { user: { select: { id: true, name: true, initials: true, image: true } } } },
      _count: { select: { messages: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const memberChannelIds = channels
    .filter((ch) => ch.members.some((m) => m.userId === session.user.id))
    .map((ch) => ch.id);
  const unreadRows = memberChannelIds.length
    ? await prisma.$queryRaw<Array<{ channelId: string; unread: bigint }>>(Prisma.sql`
        SELECT m."channelId", COUNT(*) AS unread
        FROM "Message" m
        JOIN "ChannelMember" cm
          ON cm."channelId" = m."channelId"
         AND cm."userId" = ${session.user.id}
        WHERE m."channelId" IN (${Prisma.join(memberChannelIds)})
          AND m."createdAt" > cm."lastRead"
          AND m."deletedAt" IS NULL
        GROUP BY m."channelId"
      `)
    : [];
  const unreadByChannel = new Map(unreadRows.map((row) => [row.channelId, Number(row.unread)]));

  const channelsWithUnread = channels.map((ch) => ({
    ...ch,
    unread: unreadByChannel.get(ch.id) ?? 0,
  }));

  return Response.json(channelsWithUnread);
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { name, description, type = "public", memberIds = [] } = body;

  if (!name) return Response.json({ error: "Name required" }, { status: 400 });

  const channel = await prisma.channel.create({
    data: {
      name: name.toLowerCase().replace(/\s+/g, "-"),
      description,
      type,
      createdBy: session.user.id,
      members: {
        create: [
          { userId: session.user.id, role: "owner" },
          ...memberIds
            .filter((id: string) => id !== session.user.id)
            .map((id: string) => ({ userId: id, role: "member" })),
        ],
      },
    },
    include: {
      members: { include: { user: { select: { id: true, name: true, initials: true } } } },
    },
  });

  pendoTrack("chat_channel_created", {
    visitorId: session.user.id,
    properties: {
      channelType: type,
      initialMemberCount: channel.members.length,
    },
  });

  return Response.json(channel);
}
