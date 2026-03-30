import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { pusherServer, channelName, PUSHER_EVENTS } from "@/lib/pusher";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { emoji } = await request.json();
  const message = await prisma.message.findUnique({ where: { id } });
  if (!message) return Response.json({ error: "Not found" }, { status: 404 });

  const existing = await prisma.messageReaction.findUnique({
    where: { messageId_userId_emoji: { messageId: id, userId: session.user.id, emoji } },
  });

  let event: string;
  let payload: object;

  if (existing) {
    await prisma.messageReaction.delete({ where: { id: existing.id } });
    event = PUSHER_EVENTS.REACTION_REMOVE;
    payload = { messageId: id, reactionId: existing.id, emoji, userId: session.user.id };
  } else {
    const reaction = await prisma.messageReaction.create({
      data: { messageId: id, userId: session.user.id, emoji },
      include: { user: { select: { id: true, name: true, initials: true } } },
    });
    event = PUSHER_EVENTS.REACTION_ADD;
    payload = { messageId: id, reaction };
  }

  await pusherServer.trigger(channelName(message.channelId), event, payload);
  return Response.json({ toggled: !existing });
}
