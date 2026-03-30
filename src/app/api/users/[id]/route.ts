import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const isAdmin =
    session.user.role === "super_admin" || session.user.role === "admin";
  if (!isAdmin) return Response.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const body = await request.json();

  const user = await prisma.user.update({
    where: { id },
    data: {
      ...(body.role && { role: body.role }),
      ...(body.canCreate !== undefined && { canCreate: body.canCreate }),
      ...(body.canEdit !== undefined && { canEdit: body.canEdit }),
      ...(body.canDelete !== undefined && { canDelete: body.canDelete }),
      ...(body.isActive !== undefined && { isActive: body.isActive }),
    },
  });

  return Response.json(user);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const isSuperAdmin = session.user.role === "super_admin";
  if (!isSuperAdmin) return Response.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;

  // Prevent self-deletion
  if (id === session.user.id) {
    return Response.json({ error: "Cannot delete yourself" }, { status: 400 });
  }

  await prisma.user.delete({ where: { id } });
  return Response.json({ success: true });
}
