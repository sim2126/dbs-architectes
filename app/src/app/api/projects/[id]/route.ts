import { NextRequest } from "next/server";
import { prisma } from "@/platform/db";
import {
  loadProjectForAuth,
  PermissionError,
  permissionResponse,
  requirePermission,
} from "@/platform/authz";
import { updateProject } from "@/features/projects/server/update-project";
import { announceProjectChange } from "@/features/projects/server/announce-project-change";
import { deleteProject } from "@/features/projects/server/delete-project";
import { scheduledWorkItemWhere, toLegacyAgendaItem } from "@/features/work-items";
import { ProjectInputError, requireProjectObject } from "@/features/projects/domain/project-input";

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
      assignments: { include: { user: { select: { id: true, name: true, email: true, role: true, initials: true, image: true } } } },
      workItems: { where: scheduledWorkItemWhere },
      activities: {
        include: { user: { select: { id: true, name: true, email: true, initials: true, image: true } } },
        orderBy: { createdAt: "desc" },
        take: 10,
      },
    },
  });

  if (!project) return Response.json({ error: "Not found" }, { status: 404 });
  const { workItems, ...legacyProject } = project;
  return Response.json({
    ...legacyProject,
    agendaItems: workItems.map(toLegacyAgendaItem),
  });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
  const body = await request.json();
  requireProjectObject(body);

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
  await announceProjectChange(id);
  return Response.json(project);
  } catch (error) {
    if (error instanceof ProjectInputError) return Response.json({ error: error.message }, { status: error.status });
    if (error instanceof SyntaxError) return Response.json({ error: "Invalid JSON body." }, { status: 400 });
    throw error;
  }
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
  await announceProjectChange(id);
  return Response.json({ success: true });
}
