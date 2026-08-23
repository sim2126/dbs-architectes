import { NextRequest } from "next/server";
import { auth } from "@/platform/auth";
import { prisma } from "@/platform/db";
import { isAdmin } from "@/platform/authz/permissions";

export async function GET() {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const departments = await prisma.department.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { users: true } } },
  });

  return Response.json(departments);
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(session.user.role)) return Response.json({ error: "Forbidden" }, { status: 403 });

  const { name, code, country, description } = await request.json();
  if (!name || !code) return Response.json({ error: "name and code are required" }, { status: 400 });

  const dept = await prisma.department.create({
    data: { name, code, country: country || null, description: description || null },
  });
  return Response.json(dept, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(session.user.role)) return Response.json({ error: "Forbidden" }, { status: 403 });

  const { id, name, code, country, description } = await request.json();
  if (!id) return Response.json({ error: "id is required" }, { status: 400 });

  const dept = await prisma.department.update({
    where: { id },
    data: {
      ...(name !== undefined && { name }),
      ...(code !== undefined && { code }),
      ...(country !== undefined && { country: country || null }),
      ...(description !== undefined && { description: description || null }),
    },
  });
  return Response.json(dept);
}

export async function DELETE(request: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(session.user.role)) return Response.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return Response.json({ error: "id is required" }, { status: 400 });

  await prisma.department.delete({ where: { id } });
  return Response.json({ success: true });
}
