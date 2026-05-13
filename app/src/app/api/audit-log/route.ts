/**
 * GET /api/audit-log — read the AuthorizationLog. Admin-gated.
 *
 * Filters (all optional, all combined with AND):
 *   subject   — userId of the actor
 *   action    — exact action key (e.g. "project:update")
 *   decision  — "allow" | "deny"
 *   resource  — kind (e.g. "project")
 *   since     — ISO timestamp; rows newer than this
 *   limit     — page size, default 100, max 500
 *   cursor    — id of the last row from the previous page
 *
 * Joins the subject's name for display. The captured subjectRole on
 * the log row is the truth for "what role they had when this happened" —
 * NOT the user's current role.
 */

import { NextRequest } from "next/server";
import { prisma } from "@/platform/db";
import {
  PermissionError,
  permissionResponse,
  requirePermission,
} from "@/platform/authz";

function boundedLimit(value: string | null, fallback = 100, max = 500): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.floor(parsed), max);
}

export async function GET(request: NextRequest) {
  // Reuse settings:permissions.read — admin-only by authorize().
  try {
    await requirePermission(request, "settings:permissions.read", {
      loadResource: async () => ({
        kind: "settings",
        scope: "permissions",
      }),
      context: { route: "GET /api/audit-log" },
    });
  } catch (e) {
    if (e instanceof PermissionError) return permissionResponse(e);
    throw e;
  }

  const { searchParams } = new URL(request.url);
  const subject = searchParams.get("subject") ?? undefined;
  const action = searchParams.get("action") ?? undefined;
  const decision = searchParams.get("decision") ?? undefined;
  const resource = searchParams.get("resource") ?? undefined;
  const since = searchParams.get("since") ?? undefined;
  const cursor = searchParams.get("cursor") ?? undefined;
  const limit = boundedLimit(searchParams.get("limit"));

  const sinceDate = since ? new Date(since) : undefined;

  const rows = await prisma.authorizationLog.findMany({
    where: {
      ...(subject ? { subjectId: subject } : {}),
      ...(action ? { action } : {}),
      ...(decision ? { decision } : {}),
      ...(resource ? { resourceKind: resource } : {}),
      ...(sinceDate && !Number.isNaN(sinceDate.getTime())
        ? { createdAt: { gte: sinceDate } }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    take: limit + 1,
  });

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  // Resolve subject names in a single follow-up query.
  const subjectIds = Array.from(new Set(page.map((r) => r.subjectId)));
  const users = subjectIds.length === 0
    ? []
    : await prisma.user.findMany({
        where: { id: { in: subjectIds } },
        select: { id: true, name: true, initials: true, email: true },
      });
  const userById = new Map(users.map((u) => [u.id, u]));

  return Response.json({
    rows: page.map((r) => ({
      id: r.id,
      createdAt: r.createdAt.toISOString(),
      subject: {
        id: r.subjectId,
        role: r.subjectRole,
        name: userById.get(r.subjectId)?.name ?? null,
        email: userById.get(r.subjectId)?.email ?? null,
        initials: userById.get(r.subjectId)?.initials ?? null,
      },
      action: r.action,
      resource: r.resourceKind
        ? { kind: r.resourceKind, id: r.resourceId }
        : null,
      decision: r.decision,
      reason: r.reason,
    })),
    hasMore,
    nextCursor: hasMore ? page.at(-1)?.id ?? null : null,
  });
}
