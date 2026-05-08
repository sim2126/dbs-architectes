import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ActivityClient, type ActivityItem } from "./activity-client";

export default async function ActivityPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const [rawActivities, people, projects] = await Promise.all([
    prisma.activity.findMany({
      orderBy: { createdAt: "desc" },
      take: 200,
      include: {
        user: {
          select: { id: true, name: true, initials: true, image: true },
        },
        project: {
          select: { id: true, title: true, code: true },
        },
      },
    }),
    prisma.user.findMany({
      where: { isActive: true },
      select: { id: true, name: true, initials: true },
      orderBy: { name: "asc" },
      take: 60,
    }),
    prisma.project.findMany({
      select: { id: true, title: true, code: true },
      orderBy: { updatedAt: "desc" },
      take: 60,
    }),
  ]);

  const initialActivities: ActivityItem[] = rawActivities.map((a) => ({
    id: a.id,
    type: a.type,
    description: a.description,
    createdAt: a.createdAt.toISOString(),
    user: {
      id: a.user.id,
      name: a.user.name,
      initials: a.user.initials ?? "?",
      image: a.user.image,
    },
    project: a.project
      ? { id: a.project.id, title: a.project.title, code: a.project.code }
      : null,
  }));

  const peopleOptions = people.map((p) => ({
    id: p.id,
    name: p.name ?? p.initials ?? "Unknown",
    initials: p.initials ?? "?",
  }));

  return (
    <ActivityClient
      initialActivities={initialActivities}
      people={peopleOptions}
      projects={projects}
    />
  );
}
