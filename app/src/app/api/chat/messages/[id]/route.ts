import { NextRequest } from "next/server";
import { auth } from "@/platform/auth";
import { prisma } from "@/platform/db";
import { pusherServer, channelName, PUSHER_EVENTS } from "@/platform/integrations/pusher";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { content } = await request.json();
  const message = await prisma.message.findUnique({ where: { id } });

  if (!message || message.userId !== session.user.id) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const updated = await prisma.message.update({
    where: { id },
    data: { content, editedAt: new Date() },
    include: {
      user: { select: { id: true, name: true, initials: true, image: true } },
      reactions: { include: { user: { select: { id: true, name: true, initials: true } } } },
    },
  });

  await pusherServer.trigger(channelName(message.channelId), PUSHER_EVENTS.EDIT_MESSAGE, updated);
  return Response.json(updated);
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const message = await prisma.message.findUnique({ where: { id } });
  if (!message) return Response.json({ error: "Not found" }, { status: 404 });

  const isOwner =
    message.userId === session.user.id ||
    session.user.role === "admin" ||
    session.user.role === "super_admin";

  if (!isOwner) return Response.json({ error: "Forbidden" }, { status: 403 });

  await prisma.message.update({
    where: { id },
    data: { deletedAt: new Date(), content: "This message was deleted." },
  });

  await pusherServer.trigger(channelName(message.channelId), PUSHER_EVENTS.DELETE_MESSAGE, {
    id,
    channelId: message.channelId,
  });

  return Response.json({ success: true });
}
