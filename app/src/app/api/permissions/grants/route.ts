/**
 * /api/permissions/grants — per-user permission overrides.
 *
 * GET    list every member with their active grants   (settings:permissions.read)
 * POST   upsert one grant                             (settings:permissions.update)
 * DELETE remove one grant                             (settings:permissions.update)
 *
 * Both write actions are admin-only at the authorize() layer. `grantedById`
 * comes from the authenticated subject and is never read from the body — a
 * client must not be able to attribute a permission change to someone else.
 */

import { NextRequest } from "next/server";
import { permissionResponse, PermissionError, requirePermission } from "@/platform/authz";
import { loadPermissionGrants } from "@/features/permissions/server/load-permission-grants";
import {
  clearPermissionGrant,
  GrantError,
  setPermissionGrant,
} from "@/features/permissions/server/set-permission-grant";

export async function GET(req: NextRequest) {
  try {
    await requirePermission(req, "settings:permissions.read");
  } catch (err) {
    if (err instanceof PermissionError) return permissionResponse(err);
    throw err;
  }

  const rows = await loadPermissionGrants();
  return Response.json({ subjects: rows });
}

export async function POST(req: NextRequest) {
  let subjectId: string;
  try {
    const { subject } = await requirePermission(req, "settings:permissions.update");
    subjectId = subject.userId;
  } catch (err) {
    if (err instanceof PermissionError) return permissionResponse(err);
    throw err;
  }

  const body = (await req.json().catch(() => null)) as {
    userId?: unknown;
    action?: unknown;
    effect?: unknown;
    reason?: unknown;
    expiresAt?: unknown;
  } | null;

  if (
    !body ||
    typeof body.userId !== "string" ||
    typeof body.action !== "string" ||
    typeof body.effect !== "string"
  ) {
    return Response.json(
      { error: "userId, action and effect are required." },
      { status: 400 },
    );
  }

  try {
    await setPermissionGrant({
      userId: body.userId,
      action: body.action,
      effect: body.effect,
      reason: typeof body.reason === "string" ? body.reason : null,
      expiresAt: typeof body.expiresAt === "string" ? body.expiresAt : null,
      // From the session, never the body.
      grantedById: subjectId,
    });
  } catch (err) {
    if (err instanceof GrantError) {
      return Response.json({ error: err.reason }, { status: 400 });
    }
    throw err;
  }

  return Response.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  try {
    await requirePermission(req, "settings:permissions.update");
  } catch (err) {
    if (err instanceof PermissionError) return permissionResponse(err);
    throw err;
  }

  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId");
  const action = searchParams.get("action");

  if (!userId || !action) {
    return Response.json(
      { error: "userId and action query parameters are required." },
      { status: 400 },
    );
  }

  try {
    await clearPermissionGrant(userId, action);
  } catch (err) {
    if (err instanceof GrantError) {
      return Response.json({ error: err.reason }, { status: 400 });
    }
    throw err;
  }

  return Response.json({ ok: true });
}
