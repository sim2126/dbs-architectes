/**
 * requirePermission() — the single route gate.
 *
 *   const { subject, resource } = await requirePermission(req, "project:update", {
 *     loadResource: async () => loadProjectForAuth(projectId, subject.userId),
 *   });
 *
 * Why this shape:
 *
 *   - The resource is loaded by a tuple that includes the subject (user) so
 *     we cannot fall into the "check after fetch" hole — the fetch itself is
 *     scoped. (See feedback_auth_architecture §7: "fetch by (id, ownerId)
 *     tuple, not id then check.")
 *
 *   - All checks land in authorize(), which writes the decision into
 *     AuthorizationLog via logAuthorizationDecision(). One gate, one logger.
 *
 *   - Failure modes are explicit: 401 for no session, 403 for deny, and the
 *     reason from authorize() is returned to the client (it's never user-data
 *     specific — just "you can't do X").
 */

import type { NextRequest } from "next/server";
import { auth } from "@/platform/auth";
import { prisma } from "@/platform/db";
import type { Action } from "./actions";
import {
  authorize,
  type AuthContext,
  type Decision,
  type Resource,
  type Subject,
} from "./authorize";
import { logAuthorizationDecision, type AuditContext } from "./audit";

export class PermissionError extends Error {
  readonly status: number;
  readonly reason: string;
  constructor(status: 401 | 403, reason: string) {
    super(reason);
    this.status = status;
    this.reason = reason;
    this.name = "PermissionError";
  }
}

/** JSON Response for a 401/403 error — drop-in convenience. */
export function permissionResponse(err: PermissionError): Response {
  return Response.json({ error: err.reason }, { status: err.status });
}

/** Build a Subject from the signed-in session, loading region access. */
async function loadSubject(): Promise<Subject | null> {
  const session = await auth();
  if (!session?.user?.id) return null;

  // Confirm the account is still active on every gated request. The
  // JWT cookie can live for hours after an admin flips isActive →
  // false; without this check the deactivated user keeps working
  // until the cookie expires. Cost: one indexed PK lookup per
  // gated request — measured under 2ms locally, acceptable for the
  // security guarantee. Reads the lifecycle fields only.
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { isActive: true, employmentStatus: true, role: true },
  });
  if (
    !user ||
    !user.isActive ||
    user.employmentStatus === "suspended" ||
    user.employmentStatus === "terminated"
  ) {
    return null;
  }

  // Per-session revoke. The JWT carries a UserSession row id; if the
  // row has been revoked (admin or self via Active Sessions UI), we
  // refuse the request and the next page navigation lands on /login.
  //
  // Throttled lastSeenAt update: only write when the previous touch
  // is older than 5 minutes. Keeps "last seen" useful for the UI
  // without writing on every page load.
  const sessionId = session.user.sessionId;
  if (sessionId) {
    const row = await prisma.userSession.findUnique({
      where: { id: sessionId },
      select: { id: true, revokedAt: true, lastSeenAt: true },
    });
    if (!row || row.revokedAt) return null;
    const fiveMinAgo = Date.now() - 5 * 60 * 1000;
    if (row.lastSeenAt.getTime() < fiveMinAgo) {
      // Fire-and-forget; do not block the request on this write.
      prisma.userSession
        .update({ where: { id: row.id }, data: { lastSeenAt: new Date() } })
        .catch((err: unknown) => console.warn("[authz] lastSeenAt update failed", err));
    }
  }

  type RegionRow = {
    country: string;
    operatingRegion: string | null;
    accessLevel: string;
  };

  const regions = (await prisma.userRegionAccess.findMany({
    where: { userId: session.user.id },
    select: { country: true, operatingRegion: true, accessLevel: true },
  })) as RegionRow[];
  return {
    userId: session.user.id,
    // Source role from DB, not the JWT — the JWT can be stale after a
    // role change, and authorize() must always see the truth.
    role: user.role ?? session.user.role ?? "viewer",
    regions: regions.map((r) => ({
      country: r.country,
      operatingRegion: r.operatingRegion,
      accessLevel: r.accessLevel as "view" | "manage",
    })),
  };
}

export type RequireOptions = {
  /**
   * Loads + scopes the resource for this decision. Called AFTER the session
   * is resolved (so the loader can use `subject.userId` to filter).
   *
   * Return null for actions that have no resource (e.g. "project:create").
   * Throw NotFound (or return null and let the caller 404) if the requested
   * resource doesn't exist — authorize() shouldn't reveal existence.
   */
  loadResource?: (subject: Subject) => Promise<Resource>;
  /** Free-form context for the audit log + authorize() (now, ip, route). */
  context?: AuditContext & AuthContext;
};

/**
 * The route-layer gate. Returns the subject and the loaded resource on
 * success. Throws PermissionError on 401 (no session) or 403 (deny).
 *
 * Every call writes one row to AuthorizationLog. Failures of the log itself
 * are swallowed (with a console.warn) so a logging hiccup never blocks a
 * legitimate request.
 */
export async function requirePermission(
  _req: NextRequest | null,
  action: Action,
  opts: RequireOptions = {},
): Promise<{ subject: Subject; resource: Resource }> {
  const subject = await loadSubject();
  if (!subject) {
    // No session — log nothing (we don't have a subjectId). The 401
    // itself is the audit trail at the proxy layer.
    throw new PermissionError(401, "Unauthorized");
  }

  let resource: Resource = null;
  if (opts.loadResource) {
    resource = await opts.loadResource(subject);
  }

  const decision: Decision = authorize(subject, action, resource, { now: opts.context?.now });

  // Audit log is best-effort — see audit.ts.
  await logAuthorizationDecision({
    subject,
    action,
    resource,
    decision,
    context: opts.context,
  });

  if (!decision.allow) {
    throw new PermissionError(403, decision.reason);
  }
  return { subject, resource };
}

/**
 * Resolve a Project into a ProjectResource for authorize().
 * Returns null if the project doesn't exist (the route should 404).
 *
 * Loads (id, country, caller's assignmentRole) atomically — exactly the
 * tuple needed for the decision.
 */
export async function loadProjectForAuth(
  projectId: string,
  subjectUserId: string,
): Promise<Resource> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      country: true,
      assignments: {
        where: { userId: subjectUserId },
        select: { role: true },
        take: 1,
      },
    },
  });
  if (!project) return null;
  return {
    kind: "project",
    id: project.id,
    country: project.country,
    assignmentRole: project.assignments[0]?.role ?? null,
  };
}
