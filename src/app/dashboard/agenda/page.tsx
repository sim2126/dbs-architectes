import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { AgendaClient } from "./agenda-client";

export default async function AgendaPage() {
  const session = await auth();

  const [agendaItems, projects] = await Promise.all([
    prisma.agendaItem.findMany({
      orderBy: { date: "asc" },
      include: {
        project: { select: { id: true, title: true, code: true } },
        user: { select: { id: true, name: true, initials: true } },
      },
    }),
    prisma.project.findMany({
      where: { status: "active" },
      select: { id: true, title: true, code: true },
      orderBy: { title: "asc" },
    }),
  ]);

  return (
    <AgendaClient
      initialItems={agendaItems.map((item) => ({
        id: item.id,
        title: item.title,
        description: item.description,
        date: item.date.toISOString(),
        endDate: item.endDate?.toISOString() || null,
        type: item.type,
        priority: item.priority,
        status: item.status,
        color: item.color,
        allDay: item.allDay,
        project: item.project,
        user: item.user,
      }))}
      projects={projects}
      currentUserId={session!.user.id}
    />
  );
}
