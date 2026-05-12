import { NextRequest } from "next/server";
import { prisma } from "@/platform/db";
import {
  loadProjectForAuth,
  PermissionError,
  permissionResponse,
  requirePermission,
} from "@/platform/authz";
import { updateProject } from "@/features/projects/server/update-project";
import { deleteProject } from "@/features/projects/server/delete-project";

// GET stays inline — it returns the raw Prisma shape callers already
// rely on (different from the page server component's ProjectDetailData).
// If/when the wire shape converges with the page payload, switch this
// to loadProjectDetail().
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    const { resource } = await requirePermission(request, "project:read", {
      loadResource: (s) => loadProjectForAuth(id, s.userId),
      context: { route: `GET /api/projects/${id}` },
    });
    if (!resource) return Response.json({ error: "Not found" }, { status: 404 });
  } catch (e) {
    if (e instanceof PermissionError) return permissionResponse(e);
    throw e;
  }

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

  // Narrow vs broad: assignees can change workStatus only; anything
  // wider requires "project:update".
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

  const project = await updateProject({
    projectId: id,
    actorUserId: subjectUserId,
    data: body,
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

  await deleteProject(id);
  return Response.json({ success: true });
}
