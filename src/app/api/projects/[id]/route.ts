import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      assignments: {
        include: { user: true },
      },
      agendaItems: true,
      activities: {
        include: { user: true },
        orderBy: { createdAt: "desc" },
        take: 10,
      },
    },
  });

  if (!project) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json(project);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await request.json();

  const isAdmin =
    session.user.role === "super_admin" ||
    session.user.role === "admin" ||
    session.user.role === "project_manager";

  // Any assignee can update workStatus; all other fields require admin
  const isAssignee = await prisma.projectAssignment.findUnique({
    where: { projectId_userId: { projectId: id, userId: session.user.id } },
  });

  const workStatusOnly = Object.keys(body).length === 1 && body.workStatus !== undefined;

  if (!isAdmin && !(isAssignee && workStatusOnly)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const project = await prisma.project.update({
    where: { id },
    data: {
      ...(body.title && { title: body.title }),
      ...(body.phase && { phase: body.phase }),
      ...(body.category && { category: body.category }),
      ...(body.client !== undefined && { client: body.client }),
      ...(body.year !== undefined && { year: body.year }),
      ...(body.commune !== undefined && { commune: body.commune }),
      ...(body.typology !== undefined && { typology: body.typology }),
      ...(body.terrain !== undefined && { terrain: body.terrain }),
      ...(body.roof !== undefined && { roof: body.roof }),
      ...(body.description !== undefined && { description: body.description }),
      ...(body.notes !== undefined && { notes: body.notes }),
      ...(body.billing !== undefined && { billing: body.billing }),
      ...(body.image !== undefined && { image: body.image }),
      ...(body.workStatus !== undefined && { workStatus: body.workStatus }),
      ...(body.address   !== undefined && { address: body.address }),
      ...(body.latitude  !== undefined && { latitude: body.latitude != null ? parseFloat(body.latitude) : null }),
      ...(body.longitude !== undefined && { longitude: body.longitude != null ? parseFloat(body.longitude) : null }),
    },
  });

  await prisma.activity.create({
    data: {
      type: "updated",
      description: `Progetto "${project.title}" aggiornato`,
      projectId: project.id,
      userId: session.user.id,
    },
  });

  return Response.json(project);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const canDelete =
    session.user.role === "super_admin" || session.user.role === "admin";

  if (!canDelete) return Response.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;

  await prisma.project.delete({ where: { id } });
  return Response.json({ success: true });
}
