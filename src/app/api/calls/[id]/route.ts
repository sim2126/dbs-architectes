import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { deleteDailyRoom, createMeetingToken } from "@/lib/daily";
import { pusherServer, PUSHER_EVENTS, presenceChannelName } from "@/lib/pusher";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const call = await prisma.call.findUnique({
    where: { id },
    include: {
      starter: { select: { id: true, name: true, initials: true, image: true } },
      project: { select: { id: true, title: true, code: true } },
      participants: {
        include: { user: { select: { id: true, name: true, initials: true, image: true } } },
      },
    },
  });

  if (!call) return Response.json({ error: "Not found" }, { status: 404 });

  const token = await createMeetingToken(
    call.roomName,
    session.user.name ?? session.user.email,
    call.startedBy === session.user.id
  );

  await prisma.callParticipant.upsert({
    where: { callId_userId: { callId: id, userId: session.user.id } },
    update: {},
    create: { callId: id, userId: session.user.id },
  });

  return Response.json({ ...call, token });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const call = await prisma.call.findUnique({ where: { id } });
  if (!call) return Response.json({ error: "Not found" }, { status: 404 });

  const canEnd =
    call.startedBy === session.user.id ||
    session.user.role === "admin" ||
    session.user.role === "super_admin";

  if (!canEnd) return Response.json({ error: "Forbidden" }, { status: 403 });

  await prisma.call.update({
    where: { id },
    data: { status: "ended", endedAt: new Date() },
  });

  await prisma.callParticipant.updateMany({
    where: { callId: id, leftAt: null },
    data: { leftAt: new Date() },
  });

  await deleteDailyRoom(call.roomName).catch(() => {});
  await pusherServer.trigger(presenceChannelName(), PUSHER_EVENTS.CALL_ENDED, { id });

  return Response.json({ success: true });
}
