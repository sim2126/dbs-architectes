import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

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

  // Get unread counts per channel
  const channelsWithUnread = await Promise.all(
    channels.map(async (ch) => {
      const member = ch.members.find((m) => m.userId === session.user.id);
      const unread = member
        ? await prisma.message.count({
            where: { channelId: ch.id, createdAt: { gt: member.lastRead }, deletedAt: null },
          })
        : 0;
      return { ...ch, unread };
    })
  );

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

  return Response.json(channel);
}
