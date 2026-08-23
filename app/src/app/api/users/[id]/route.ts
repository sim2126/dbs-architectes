import { NextRequest } from "next/server";
import { auth } from "@/platform/auth";
import { prisma } from "@/platform/db";
import { isAdmin, defaultPermissionsForRole } from "@/platform/authz/permissions";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(session.user.role)) return Response.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const user = await prisma.user.findUnique({
    where: { id },
    include: {
      department: { select: { id: true, name: true, code: true } },
      regionAccess: true,
      roleChangesFrom: {
        orderBy: { createdAt: "desc" },
        take: 20,
        include: { actor: { select: { name: true, initials: true } } },
      },
    },
  });

  if (!user) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json(user);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(session.user.role)) return Response.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const body = await request.json();

  // Fetch current user to detect role changes and handle status transitions
  const current = await prisma.user.findUnique({
    where: { id },
    select: { role: true, isActive: true, isExternal: true },
  });
  if (!current) return Response.json({ error: "Not found" }, { status: 404 });
  if (
    current.isExternal &&
    ((body.role !== undefined && body.role !== "employee") ||
      body.canCreate === true ||
      body.canEdit === true ||
      body.canDelete === true)
  ) {
    return Response.json(
      { error: "Guest accounts cannot receive staff roles or capabilities" },
      { status: 400 },
    );
  }

  const updateData: Record<string, unknown> = {};

  if (body.role !== undefined) updateData.role = body.role;
  if (body.canCreate !== undefined) updateData.canCreate = body.canCreate;
  if (body.canEdit !== undefined) updateData.canEdit = body.canEdit;
  if (body.canDelete !== undefined) updateData.canDelete = body.canDelete;
  if (body.isActive !== undefined) updateData.isActive = body.isActive;
  if (body.departmentId !== undefined) updateData.departmentId = body.departmentId || null;
  if (body.managerId !== undefined) updateData.managerId = body.managerId || null;
  if (body.defaultCountry !== undefined) updateData.defaultCountry = body.defaultCountry || null;
  if (body.defaultRegion !== undefined) updateData.defaultRegion = body.defaultRegion || null;
  if (body.name !== undefined) updateData.name = body.name;
  if (body.phone !== undefined) updateData.phone = body.phone;

  // Employment status transition — auto-sync isActive
  if (body.employmentStatus !== undefined) {
    updateData.employmentStatus = body.employmentStatus;
    if (body.employmentStatus === "suspended" || body.employmentStatus === "terminated") {
      updateData.isActive = false;
      updateData.deactivatedAt = new Date();
    } else if (body.employmentStatus === "active") {
      updateData.isActive = true;
      updateData.deactivatedAt = null;
    }
  }

  // When a new role is assigned, auto-derive permission flags unless explicitly overridden
  if (body.role !== undefined && body.role !== current.role) {
    const derived = defaultPermissionsForRole(body.role);
    if (body.canCreate === undefined) updateData.canCreate = derived.canCreate;
    if (body.canEdit === undefined) updateData.canEdit = derived.canEdit;
    if (body.canDelete === undefined) updateData.canDelete = derived.canDelete;

    // Record the role change
    await prisma.roleChangeLog.create({
      data: {
        userId: id,
        changedBy: session.user.id,
        fromRole: current.role,
        toRole: body.role,
        reason: body.roleChangeReason || null,
      },
    });
  }

  const user = await prisma.user.update({
    where: { id },
    data: updateData,
    select: {
      id: true, name: true, email: true, role: true, initials: true,
      isActive: true, isExternal: true, canCreate: true, canEdit: true, canDelete: true,
      employmentStatus: true, defaultCountry: true, defaultRegion: true,
      departmentId: true, deactivatedAt: true,
    },
  });

  return Response.json(user);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(session.user.role)) return Response.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  if (id === session.user.id) {
    return Response.json({ error: "Cannot delete yourself" }, { status: 400 });
  }

  // Soft-deactivate by default (preserve history); only hard-delete when ?hard=1
  const url = new URL(_request.url);
  if (url.searchParams.get("hard") === "1") {
    await prisma.user.delete({ where: { id } });
    return Response.json({ success: true, deleted: true });
  }

  // Soft delete — suspend and deactivate, keep all records
  await prisma.user.update({
    where: { id },
    data: { isActive: false, employmentStatus: "terminated", deactivatedAt: new Date() },
  });
  return Response.json({ success: true, deleted: false, status: "terminated" });
}
