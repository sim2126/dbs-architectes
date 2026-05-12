import { NextRequest } from "next/server";
import { auth } from "@/platform/auth";
import { prisma } from "@/platform/db";
import { isAdmin, defaultPermissionsForRole } from "@/platform/authz/permissions";
import bcrypt from "bcryptjs";

export async function GET() {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(session.user.role)) return Response.json({ error: "Forbidden" }, { status: 403 });

  const users = await prisma.user.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      initials: true,
      isActive: true,
      canCreate: true,
      canEdit: true,
      canDelete: true,
      employmentStatus: true,
      defaultCountry: true,
      defaultRegion: true,
      departmentId: true,
      managerId: true,
      deactivatedAt: true,
      createdAt: true,
      department: { select: { id: true, name: true, code: true } },
      regionAccess: { select: { country: true, operatingRegion: true, accessLevel: true } },
      _count: { select: { projects: true } },
    },
  });

  return Response.json(users);
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(session.user.role)) return Response.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json();
  const { name, email, password, role, employmentStatus, departmentId, managerId, defaultCountry, defaultRegion } = body;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return Response.json({ error: "Email already exists" }, { status: 400 });

  const hashed = await bcrypt.hash(password || "password123", 10);
  const initials = name
    ?.split(" ")
    .map((n: string) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const effectiveRole = role || "employee";
  const perms = defaultPermissionsForRole(effectiveRole);

  const user = await prisma.user.create({
    data: {
      name,
      email,
      password: hashed,
      role: effectiveRole,
      initials,
      isActive: true,
      employmentStatus: employmentStatus || "active",
      defaultCountry: defaultCountry || null,
      defaultRegion: defaultRegion || null,
      departmentId: departmentId || null,
      managerId: managerId || null,
      ...perms,
    },
    select: {
      id: true, name: true, email: true, role: true, initials: true,
      isActive: true, canCreate: true, canEdit: true, canDelete: true,
      employmentStatus: true, defaultCountry: true, defaultRegion: true,
      departmentId: true, createdAt: true,
    },
  });

  // Log role assignment as initial role change
  await prisma.roleChangeLog.create({
    data: {
      userId: user.id,
      changedBy: session.user.id,
      fromRole: "—",
      toRole: effectiveRole,
      reason: "Initial account creation",
    },
  });

  return Response.json(user, { status: 201 });
}
