import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { createGoogleEvent, deleteGoogleEvent } from "@/lib/google-calendar";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { agendaItemId, action } = await request.json();

  const token = await prisma.googleCalendarToken.findUnique({
    where: { userId: session.user.id },
  });

  if (!token) {
    return Response.json({ error: "Google Calendar not connected" }, { status: 400 });
  }

  if (action === "sync") {
    const item = await prisma.agendaItem.findUnique({
      where: { id: agendaItemId },
      include: { project: { select: { title: true } } },
    });

    if (!item) return Response.json({ error: "Item not found" }, { status: 404 });

    // Only the item owner (or admins) may sync it to their calendar
    const isAdmin = session.user.role === "admin" || session.user.role === "super_admin";
    if (item.userId !== session.user.id && !isAdmin) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    const event = await createGoogleEvent(token.accessToken, token.refreshToken ?? undefined, {
      title: item.project ? `[${item.project.title}] ${item.title}` : item.title,
      description: item.description ?? undefined,
      start: item.date,
      end: item.endDate ?? undefined,
      allDay: item.allDay,
    });

    await prisma.agendaItem.update({
      where: { id: agendaItemId },
      data: { googleEventId: event.id },
    });

    return Response.json({ success: true, eventId: event.id });
  }

  if (action === "unsync") {
    const item = await prisma.agendaItem.findUnique({ where: { id: agendaItemId } });
    if (!item?.googleEventId) return Response.json({ success: true });

    const isAdmin = session.user.role === "admin" || session.user.role === "super_admin";
    if (item.userId !== session.user.id && !isAdmin) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    await deleteGoogleEvent(token.accessToken, token.refreshToken ?? undefined, item.googleEventId);
    await prisma.agendaItem.update({ where: { id: agendaItemId }, data: { googleEventId: null } });

    return Response.json({ success: true });
  }

  return Response.json({ error: "Invalid action" }, { status: 400 });
}

export async function GET() {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const token = await prisma.googleCalendarToken.findUnique({
    where: { userId: session.user.id },
  });

  return Response.json({ connected: !!token });
}

export async function DELETE() {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  await prisma.googleCalendarToken.deleteMany({ where: { userId: session.user.id } });
  return Response.json({ success: true });
}
