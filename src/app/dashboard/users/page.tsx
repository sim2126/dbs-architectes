import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { UsersClient } from "./users-client";

export default async function UsersPage() {
  const session = await auth();

  const isAdmin =
    session?.user.role === "super_admin" || session?.user.role === "admin";
  if (!isAdmin) redirect("/dashboard");

  const users = await prisma.user.findMany({
    orderBy: { createdAt: "asc" },
    include: {
      _count: { select: { projects: true } },
    },
  });

  return (
    <UsersClient
      users={users.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        initials: u.initials,
        isActive: u.isActive,
        canCreate: u.canCreate,
        canEdit: u.canEdit,
        canDelete: u.canDelete,
        createdAt: u.createdAt.toISOString(),
        projectCount: u._count.projects,
      }))}
      isSuperAdmin={session?.user.role === "super_admin"}
      currentUserId={session!.user.id}
    />
  );
}
