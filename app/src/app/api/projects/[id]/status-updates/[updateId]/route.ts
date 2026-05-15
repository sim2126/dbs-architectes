/**
 * DELETE /api/projects/[id]/status-updates/[updateId]
 *
 * Author of the update or anyone with `project:status.delete` (managers,
 * directors, project leads) may remove a status entry.
 */

import { NextRequest } from "next/server";
import { prisma } from "@/platform/db";
import {
  authorize,
  loadProjectForAuth,
  logAuthorizationDecision,
  PermissionError,
  permissionResponse,
  requirePermission,
} from "@/platform/authz";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; updateId: string }> },
) {
  const { id, updateId } = await params;

  // First require project:read so we know the caller can even see this
  // project; we'll layer the row-level author check on top.
  let actorUserId: string;
  let actorSubject;
  let projectResource;
  try {
    const { subject, resource } = await requirePermission(request, "project:read", {
      loadResource: (s) => loadProjectForAuth(id, s.userId),
      context: { route: `DELETE /api/projects/${id}/status-updates/${updateId}` },
    });
    if (!resource) return Response.json({ error: "Not found" }, { status: 404 });
    actorUserId = subject.userId;
    actorSubject = subject;
    projectResource = resource;
  } catch (e) {
    if (e instanceof PermissionError) return permissionResponse(e);
    throw e;
  }

  const existing = await prisma.projectStatusUpdate.findUnique({
    where: { id: updateId },
    select: { id: true, projectId: true, authorId: true },
  });
  if (!existing || existing.projectId !== id) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  // Allow if author OR policy says so.
  const isAuthor = existing.authorId === actorUserId;
  let allowed = isAuthor;
  let reason: string | null = null;
  if (!allowed) {
    const decision = authorize(actorSubject, "project:status.delete", projectResource);
    await logAuthorizationDecision({
      subject: actorSubject,
      action: "project:status.delete",
      resource: projectResource,
      decision,
      context: {
        route: `DELETE /api/projects/${id}/status-updates/${updateId}`,
        requestId: updateId,
      },
    });
    allowed = decision.allow;
    if (!decision.allow) reason = decision.reason;
  }
  if (!allowed) {
    return Response.json(
      { error: reason ?? "Forbidden" },
      { status: 403 },
    );
  }

  await prisma.projectStatusUpdate.delete({ where: { id: updateId } });
  return Response.json({ ok: true });
}
