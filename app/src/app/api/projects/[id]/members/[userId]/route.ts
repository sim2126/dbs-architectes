/**
 * PATCH  /api/projects/[id]/members/[userId] — change an existing
 *        assignment's role.
 * DELETE /api/projects/[id]/members/[userId] — remove a member.
 *
 * Both gated by `project:assign`.
 */

import { NextRequest } from "next/server";
import { prisma } from "@/platform/db";
import {
  loadProjectForAuth,
  PermissionError,
  permissionResponse,
  requirePermission,
} from "@/platform/authz";
import { pendoTrack } from "@/platform/integrations/pendo";

const VALID_ROLES = ["lead", "editor", "reviewer", "viewer"] as const;
type AssignmentRole = (typeof VALID_ROLES)[number];

function isAssignmentRole(s: unknown): s is AssignmentRole {
  return typeof s === "string" && (VALID_ROLES as readonly string[]).includes(s);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; userId: string }> },
) {
  const { id, userId } = await params;

  let actorUserId: string;
  try {
    const { resource, subject } = await requirePermission(request, "project:assign", {
      loadResource: (s) => loadProjectForAuth(id, s.userId),
      context: { route: `PATCH /api/projects/${id}/members/${userId}` },
    });
    if (!resource) return Response.json({ error: "Not found" }, { status: 404 });
    actorUserId = subject.userId;
  } catch (e) {
    if (e instanceof PermissionError) return permissionResponse(e);
    throw e;
  }

  const body = (await request.json().catch(() => null)) as { role?: string } | null;
  if (!isAssignmentRole(body?.role)) {
    return Response.json(
      { error: "role (lead|editor|reviewer|viewer) is required" },
      { status: 400 },
    );
  }

  const existing = await prisma.projectAssignment.findUnique({
    where: { projectId_userId: { projectId: id, userId } },
    select: { id: true, role: true, user: { select: { name: true, email: true } } },
  });
  if (!existing) {
    return Response.json({ error: "Not a project member" }, { status: 404 });
  }

  const previousRole = existing.role;

  await prisma.projectAssignment.update({
    where: { id: existing.id },
    data: { role: body.role },
  });

  pendoTrack("project_member_role_changed", {
    visitorId: actorUserId,
    properties: {
      projectId: id,
      targetUserId: userId,
      previousRole,
      newRole: body.role,
    },
  });

  await prisma.activity.create({
    data: {
      type: "team",
      description: `${existing.user.name ?? existing.user.email} role → ${body.role}`,
      projectId: id,
      userId: actorUserId,
    },
  });

  return Response.json({ ok: true, role: body.role });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; userId: string }> },
) {
  const { id, userId } = await params;

  let actorUserId: string;
  try {
    const { resource, subject } = await requirePermission(request, "project:assign", {
      loadResource: (s) => loadProjectForAuth(id, s.userId),
      context: { route: `DELETE /api/projects/${id}/members/${userId}` },
    });
    if (!resource) return Response.json({ error: "Not found" }, { status: 404 });
    actorUserId = subject.userId;
  } catch (e) {
    if (e instanceof PermissionError) return permissionResponse(e);
    throw e;
  }

  const existing = await prisma.projectAssignment.findUnique({
    where: { projectId_userId: { projectId: id, userId } },
    select: { id: true, user: { select: { name: true, email: true } } },
  });
  if (!existing) {
    // Already removed — idempotent success.
    return Response.json({ ok: true });
  }

  await prisma.projectAssignment.delete({ where: { id: existing.id } });

  pendoTrack("project_member_removed", {
    visitorId: actorUserId,
    properties: {
      projectId: id,
      removedUserId: userId,
    },
  });

  await prisma.activity.create({
    data: {
      type: "team",
      description: `${existing.user.name ?? existing.user.email} removed from project`,
      projectId: id,
      userId: actorUserId,
    },
  });

  return Response.json({ ok: true });
}
