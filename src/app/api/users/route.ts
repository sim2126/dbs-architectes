import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import bcrypt from "bcryptjs";

export async function GET() {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const isAdmin =
    session.user.role === "super_admin" || session.user.role === "admin";
  if (!isAdmin) return Response.json({ error: "Forbidden" }, { status: 403 });

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
      createdAt: true,
      _count: { select: { projects: true } },
    },
  });

  return Response.json(users);
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const isAdmin =
    session.user.role === "super_admin" || session.user.role === "admin";
  if (!isAdmin) return Response.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json();
  const { name, email, password, role } = body;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return Response.json({ error: "Email already exists" }, { status: 400 });
  }

  const hashed = await bcrypt.hash(password || "password123", 10);
  const initials = name
    ?.split(" ")
    .map((n: string) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const user = await prisma.user.create({
    data: {
      name,
      email,
      password: hashed,
      role: role || "viewer",
      initials,
      isActive: true,
      canCreate: role === "project_manager" || role === "admin" || role === "super_admin",
      canEdit: role !== "viewer",
      canDelete: role === "admin" || role === "super_admin",
    },
  });

  return Response.json(user, { status: 201 });
}
