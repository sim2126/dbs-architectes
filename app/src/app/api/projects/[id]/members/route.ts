/**
 * POST   /api/projects/[id]/members — add a user to a project
 *
 * Body: { userId: string, role: "lead" | "editor" | "reviewer" | "viewer" }.
 * Gated by `project:assign`. Idempotent — re-adding an existing member
 * updates their role rather than throwing a unique-key conflict.
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

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  let actorUserId: string;
  try {
    const { resource, subject } = await requirePermission(request, "project:assign", {
      loadResource: (s) => loadProjectForAuth(id, s.userId),
      context: { route: `POST /api/projects/${id}/members` },
    });
    if (!resource) return Response.json({ error: "Not found" }, { status: 404 });
    actorUserId = subject.userId;
  } catch (e) {
    if (e instanceof PermissionError) return permissionResponse(e);
    throw e;
  }

  const body = (await request.json().catch(() => null)) as {
    userId?: string;
    role?: string;
  } | null;
  if (!body?.userId || !isAssignmentRole(body.role)) {
    return Response.json(
      { error: "userId and role (lead|editor|reviewer|viewer) are required" },
      { status: 400 },
    );
  }

  // Ensure target user exists and is active before assigning. Without this
  // check the upsert silently creates an orphan row referencing nothing.
  const target = await prisma.user.findUnique({
    where: { id: body.userId },
    select: { id: true, isActive: true, name: true, email: true, initials: true, role: true, image: true },
  });
  if (!target || !target.isActive) {
    return Response.json({ error: "User not found or inactive" }, { status: 404 });
  }

  const assignment = await prisma.projectAssignment.upsert({
    where: { projectId_userId: { projectId: id, userId: body.userId } },
    create: { projectId: id, userId: body.userId, role: body.role },
    update: { role: body.role },
  });

  pendoTrack("project_member_added", {
    visitorId: actorUserId,
    properties: {
      projectId: id,
      assignedUserId: body.userId,
      assignmentRole: body.role,
    },
  });

  await prisma.activity.create({
    data: {
      type: "team",
      description: `${target.name ?? target.email} added as ${body.role}`,
      projectId: id,
      userId: actorUserId,
    },
  });

  return Response.json({
    userId: assignment.userId,
    role: assignment.role,
    user: {
      id: target.id,
      name: target.name,
      email: target.email,
      initials: target.initials,
      image: target.image,
      role: target.role,
    },
  });
}
