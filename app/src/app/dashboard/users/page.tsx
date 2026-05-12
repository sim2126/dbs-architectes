import { auth } from "@/platform/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/platform/db";
import { isAdmin } from "@/platform/authz/permissions";
import { UsersClient } from "@/features/users";

export default async function UsersPage() {
  const session = await auth();
  if (!session || !isAdmin(session.user.role)) redirect("/dashboard");

  const [users, departments] = await Promise.all([
    prisma.user.findMany({
      orderBy: { createdAt: "asc" },
      include: {
        _count: { select: { projects: true } },
        department: { select: { id: true, name: true, code: true } },
        regionAccess: { select: { country: true, operatingRegion: true, accessLevel: true } },
      },
    }),
    prisma.department.findMany({ orderBy: { name: "asc" } }),
  ]);

  return (
    <UsersClient
      users={users.map((u) => ({
        id:               u.id,
        name:             u.name,
        email:            u.email,
        role:             u.role,
        initials:         u.initials,
        isActive:         u.isActive,
        canCreate:        u.canCreate,
        canEdit:          u.canEdit,
        canDelete:        u.canDelete,
        employmentStatus: u.employmentStatus,
        defaultCountry:   u.defaultCountry,
        defaultRegion:    u.defaultRegion,
        departmentId:     u.departmentId,
        createdAt:        u.createdAt.toISOString(),
        projectCount:     u._count.projects,
        department:       u.department,
        regionAccess:     u.regionAccess,
      }))}
      currentUserId={session.user.id}
      departments={departments}
    />
  );
}
