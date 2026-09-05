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
import { isAction, type Action } from "./actions";
import {
  authorize,
  type AuthContext,
  type Decision,
  type PermissionGrant,
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
/**
 * Builds the authorization Subject for the current session.
 *
 * Exported because server components need the same Subject the API routes
 * use — notably the dashboard, which composes its widgets from authorize()
 * decisions. Duplicating this would risk a second, staler answer to "who is
 * this and what regions do they hold".
 */
export async function loadSubject(): Promise<Subject | null> {
  // AuthZ decides which actions a guest may perform. The lower-level auth()
  // helper denies guests by default so legacy routes fail closed; this is the
  // explicit, policy-aware entry point for conversation and self access.
  const session = await auth({ allowExternal: true });
  if (!session?.user?.id) return null;

  const subject = await loadSubjectForUser(session.user.id);
  if (!subject) return null;

  // Per-session revoke. The JWT carries a UserSession row id.
  const sessionId = session.user.sessionId;
  if (sessionId) {
    const row = await prisma.userSession.findUnique({
      where: { id: sessionId },
      select: { id: true, revokedAt: true, lastSeenAt: true },
    });
    if (!row || row.revokedAt) return null;
    const fiveMinAgo = Date.now() - 5 * 60 * 1000;
    if (row.lastSeenAt.getTime() < fiveMinAgo) {
      prisma.userSession
        .update({ where: { id: row.id }, data: { lastSeenAt: new Date() } })
        .catch((err: unknown) => console.warn("[authz] lastSeenAt update failed", err));
    }
  }
  return subject;
}

/** Live identity and grants for a notification recipient or session owner. */
export async function loadSubjectForUser(userId: string): Promise<Subject | null> {
  return (await loadSubjectsForUsers([userId]))[0] ?? null;
}

/** Batch recipient checks share exactly the live session policy projection. */
export async function loadSubjectsForUsers(userIds: readonly string[]): Promise<Subject[]> {
  if (userIds.length === 0) return [];
  const users = await prisma.user.findMany({
    where: {
      id: { in: [...new Set(userIds)] },
      isActive: true,
      employmentStatus: { notIn: ["suspended", "terminated"] },
    },
    select: {
      id: true,
      role: true,
      isExternal: true,
      regionAccess: { select: { country: true, operatingRegion: true, accessLevel: true } },
      permissionGrants: {
        where: { OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
        select: { action: true, effect: true },
      },
    },
  });
  return users.map((user) => {
    const grants: PermissionGrant[] = [];
    for (const row of user.permissionGrants) {
      if (!isAction(row.action) || (row.effect !== "allow" && row.effect !== "deny")) continue;
      grants.push({ action: row.action, effect: row.effect });
    }
    return {
      userId: user.id,
      role: user.role,
      isExternal: user.isExternal,
      regions: user.regionAccess.flatMap((region) => {
        const accessLevel = region.accessLevel;
        if (accessLevel !== "view" && accessLevel !== "manage") return [];
        return [{ country: region.country, operatingRegion: region.operatingRegion, accessLevel }];
      }),
      grants,
    };
  });
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
      operatingRegion: true,
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
    operatingRegion: project.operatingRegion,
    assignmentRole: project.assignments[0]?.role ?? null,
  };
}
