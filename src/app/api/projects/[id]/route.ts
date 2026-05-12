import { NextRequest } from "next/server";
import { prisma } from "@/platform/db";
import {
  loadProjectForAuth,
  PermissionError,
  permissionResponse,
  requirePermission,
} from "@/platform/authz";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  let subjectUserId: string;
  try {
    const { subject, resource } = await requirePermission(request, "project:read", {
      loadResource: (s) => loadProjectForAuth(id, s.userId),
      context: { route: `GET /api/projects/${id}` },
    });
    // null resource means the project doesn't exist — surface a clean 404
    // rather than the 403 authorize() returns for a missing project.
    if (!resource) return Response.json({ error: "Not found" }, { status: 404 });
    subjectUserId = subject.userId;
  } catch (e) {
    if (e instanceof PermissionError) return permissionResponse(e);
    throw e;
  }
  void subjectUserId;

  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      assignments: { include: { user: true } },
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
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json();

  // Narrow vs broad update: assignees can change workStatus only;
  // everything else requires "project:update" which goes through the
  // assignment-role / region-access checks in authorize().
  const workStatusOnly =
    Object.keys(body).length === 1 && body.workStatus !== undefined;
  const action = workStatusOnly ? "project:update.status" : "project:update";

  let subjectUserId: string;
  try {
    const { subject, resource } = await requirePermission(request, action, {
      loadResource: (s) => loadProjectForAuth(id, s.userId),
      context: { route: `PATCH /api/projects/${id}`, requestId: action },
    });
    if (!resource) return Response.json({ error: "Not found" }, { status: 404 });
    subjectUserId = subject.userId;
  } catch (e) {
    if (e instanceof PermissionError) return permissionResponse(e);
    throw e;
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
      userId: subjectUserId,
    },
  });

  return Response.json(project);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    const { resource } = await requirePermission(request, "project:delete", {
      loadResource: (s) => loadProjectForAuth(id, s.userId),
      context: { route: `DELETE /api/projects/${id}` },
    });
    if (!resource) return Response.json({ error: "Not found" }, { status: 404 });
  } catch (e) {
    if (e instanceof PermissionError) return permissionResponse(e);
    throw e;
  }

  await prisma.project.delete({ where: { id } });
  return Response.json({ success: true });
}
