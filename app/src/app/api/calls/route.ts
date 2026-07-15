import { NextRequest } from "next/server";
import { auth } from "@/platform/auth";
import { prisma } from "@/platform/db";
import { createDailyRoom } from "@/platform/integrations/daily";
import { pusherServer, PUSHER_EVENTS, presenceChannelName } from "@/platform/integrations/pusher";
import { pendoTrack } from "@/platform/integrations/pendo-track";

export async function GET() {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const rawCalls = await prisma.call.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      starter: { select: { id: true, name: true, initials: true, image: true } },
      project: { select: { id: true, title: true, code: true } },
      participants: {
        include: { user: { select: { id: true, name: true, initials: true, image: true } } },
      },
    },
  });

  // Flatten fields the client cares about; strip heavy transcript text
  const calls = rawCalls.map(({ transcriptText: _t, ...c }) => c);

  return Response.json(calls);
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { title, type = "video", projectId } = body;

  const room = await createDailyRoom({ expiryMinutes: 180 });

  const call = await prisma.call.create({
    data: {
      roomName: room.name,
      roomUrl: room.url,
      title: title ?? `Call by ${session.user.name}`,
      type,
      status: "active",
      startedBy: session.user.id,
      projectId: projectId ?? null,
      participants: {
        create: { userId: session.user.id },
      },
    },
    include: {
      starter: { select: { id: true, name: true, initials: true, image: true } },
      project: { select: { id: true, title: true, code: true } },
      participants: {
        include: { user: { select: { id: true, name: true, initials: true, image: true } } },
      },
    },
  });

  // Notify all workspace members via Pusher
  await pusherServer.trigger(presenceChannelName(), PUSHER_EVENTS.CALL_STARTED, call);

  pendoTrack("call_started", {
    visitorId: session.user.id,
    properties: {
      call_id: call.id,
      call_type: type,
      project_id: projectId ?? "",
      room_name: room.name,
    },
  });

  return Response.json(call);
}
