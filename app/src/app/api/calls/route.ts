import { NextRequest } from "next/server";
import { auth } from "@/platform/auth";
import { prisma } from "@/platform/db";
import { createDailyRoom } from "@/platform/integrations/daily";
import { pusherServer, PUSHER_EVENTS, presenceChannelName } from "@/platform/integrations/pusher";

export async function GET() {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const isAdmin = session.user.role === "admin" || session.user.role === "super_admin";
  const rawCalls = await prisma.call.findMany({
    where: isAdmin
      ? undefined
      : {
          OR: [
            { startedBy: session.user.id },
            { participants: { some: { userId: session.user.id } } },
            { project: { assignments: { some: { userId: session.user.id } } } },
          ],
        },
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

  if (projectId) {
    const isAdmin = session.user.role === "admin" || session.user.role === "super_admin";
    const project = await prisma.project.findFirst({
      where: {
        id: projectId,
        ...(isAdmin ? {} : { assignments: { some: { userId: session.user.id } } }),
      },
      select: { id: true },
    });
    if (!project) return Response.json({ error: "Forbidden" }, { status: 403 });
  }

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
