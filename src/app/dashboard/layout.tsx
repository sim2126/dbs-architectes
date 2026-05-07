import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { FridayShell } from "@/components/friday/shell";
import { BrowserNotificationBanner } from "@/components/browser-notification-banner";
import { ToastHost } from "@/components/toast";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session) redirect("/login");

  const userId = session.user.id;

  const [me, starredFavorites, openTasks] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, initials: true, role: true, image: true },
    }),
    prisma.favorite.findMany({
      where: { userId, entityType: "project" },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
    prisma.task
      .count({
        where: { userId, status: { not: "done" } },
      })
      .catch(() => 0),
  ]);

  const starredProjectIds = starredFavorites.map((f) => f.entityId);
  const starredProjects = starredProjectIds.length
    ? await prisma.project.findMany({
        where: { id: { in: starredProjectIds } },
        select: { id: true, code: true, title: true, workStatus: true },
      })
    : [];

  // Preserve favorite order (most recently starred first)
  const starredById = new Map(starredProjects.map((p) => [p.id, p]));
  const starred = starredProjectIds
    .map((id) => starredById.get(id))
    .filter((p): p is NonNullable<typeof p> => Boolean(p))
    .map((p) => ({
      code: p.code,
      name: p.title,
      status: p.workStatus,
      href: `/dashboard/projects/${p.id}`,
    }));

  const fallbackName = me?.name ?? session.user.name ?? "User";
  const fallbackInitials =
    me?.initials ??
    (fallbackName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0])
      .join("")
      .toUpperCase() ||
      "?");

  return (
    <>
      <FridayShell
        starred={starred}
        user={{
          name: fallbackName,
          role: me?.role ?? session.user.role ?? "Member",
          initials: fallbackInitials,
          imageUrl: me?.image ?? null,
        }}
        tasksCount={openTasks || undefined}
      >
        {children}
      </FridayShell>
      <BrowserNotificationBanner />
      <ToastHost />
    </>
  );
}
