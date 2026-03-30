import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { deleteDailyRoom, createMeetingToken } from "@/lib/daily";
import { pusherServer, PUSHER_EVENTS, presenceChannelName } from "@/lib/pusher";

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const call = await prisma.call.findUnique({
    where: { id: params.id },
    include: {
      starter: { select: { id: true, name: true, initials: true, image: true } },
      project: { select: { id: true, title: true, code: true } },
      participants: {
        include: { user: { select: { id: true, name: true, initials: true, image: true } } },
      },
    },
  });

  if (!call) return Response.json({ error: "Not found" }, { status: 404 });

  // Generate meeting token for this user
  const token = await createMeetingToken(
    call.roomName,
    session.user.name ?? session.user.email,
    call.startedBy === session.user.id
  );

  // Add as participant if not already
  await prisma.callParticipant.upsert({
    where: { id: `${params.id}-${session.user.id}` },
    update: {},
    create: { callId: params.id, userId: session.user.id },
  }).catch(() => {
    // ignore unique constraint errors
  });

  return Response.json({ ...call, token });
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const call = await prisma.call.findUnique({ where: { id: params.id } });
  if (!call) return Response.json({ error: "Not found" }, { status: 404 });

  const canEnd =
    call.startedBy === session.user.id ||
    session.user.role === "admin" ||
    session.user.role === "super_admin";

  if (!canEnd) return Response.json({ error: "Forbidden" }, { status: 403 });

  await prisma.call.update({
    where: { id: params.id },
    data: { status: "ended", endedAt: new Date() },
  });

  await prisma.callParticipant.updateMany({
    where: { callId: params.id, leftAt: null },
    data: { leftAt: new Date() },
  });

  await deleteDailyRoom(call.roomName).catch(() => {});
  await pusherServer.trigger(presenceChannelName(), PUSHER_EVENTS.CALL_ENDED, { id: params.id });

  return Response.json({ success: true });
}
