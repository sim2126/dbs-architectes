import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { createDailyRoom } from "@/lib/daily";
import { pusherServer, PUSHER_EVENTS, presenceChannelName } from "@/lib/pusher";

export async function GET() {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const calls = await prisma.call.findMany({
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

  return Response.json(call);
}
