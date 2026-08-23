import { auth } from "@/platform/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/platform/db";
import { AgendaClient } from "@/features/agenda";
import {
  compareAgendaItems,
  scheduledWorkItemWhere,
  toLegacyAgendaItem,
} from "@/features/work-items";

export default async function AgendaPage() {
  const session = await auth({ allowExternal: true });
  if (!session) redirect("/login");
  if (session.user.isExternal) redirect("/dashboard/chat");

  const [agendaItems, projects] = await Promise.all([
    prisma.workItem.findMany({
      where: scheduledWorkItemWhere,
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
      initialItems={agendaItems.sort(compareAgendaItems).map((item) => {
        const legacyItem = toLegacyAgendaItem(item);
        return {
          id: legacyItem.id,
          title: legacyItem.title,
          description: legacyItem.description,
          date: legacyItem.date.toISOString(),
          endDate: legacyItem.endDate?.toISOString() || null,
          type: legacyItem.type,
          priority: legacyItem.priority,
          status: legacyItem.status,
          color: legacyItem.color,
          allDay: legacyItem.allDay,
          project: item.project,
          user: item.user,
        };
      })}
      projects={projects}
      currentUserId={session.user.id}
    />
  );
}
