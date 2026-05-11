/**
 * Audit logger — writes every authorize() decision into AuthorizationLog.
 *
 * The contract is: log first, return second. Callers should never make the
 * authorization decision visible to the user before the log row is durable.
 * That ordering is what makes the audit log the source of truth a security
 * review can rely on.
 *
 * Failures here MUST NOT bubble into the request path: we log a warning and
 * continue. The decision itself is what guards the resource — the log is an
 * after-the-fact record.
 */

import { prisma } from "@/lib/db";
import type { Action } from "./actions";
import type { Decision, Resource, Subject } from "./authorize";

export type AuditContext = {
  /** e.g. "PATCH /api/projects/:id" */
  route?: string;
  /** Request-correlation id (uuid) — propagate from middleware when available. */
  requestId?: string;
  /** Best-effort client IP, if known. */
  ip?: string;
};

function resourceKey(resource: Resource): { kind: string | null; id: string | null } {
  if (!resource) return { kind: null, id: null };
  switch (resource.kind) {
    case "project": return { kind: "project", id: resource.id };
    case "user":    return { kind: "user",    id: resource.id };
    case "agenda":  return { kind: "agenda",  id: resource.projectId ?? resource.userId };
    case "chat":    return { kind: "chat",    id: resource.channelId };
    case "sheet":   return { kind: "sheet",   id: resource.ownerId };
    case "task":    return { kind: "task",    id: resource.projectId ?? resource.userId };
    case "billing": return { kind: "billing", id: null };
    case "ai":      return { kind: "ai",      id: null };
    case "settings":
      return { kind: "settings", id: resource.targetUserId ?? resource.scope };
  }
}

export async function logAuthorizationDecision(args: {
  subject: Subject;
  action: Action;
  resource: Resource;
  decision: Decision;
  context?: AuditContext;
}): Promise<void> {
  const { subject, action, resource, decision, context } = args;
  const { kind, id } = resourceKey(resource);

  try {
    await prisma.authorizationLog.create({
      data: {
        subjectId:    subject.userId,
        subjectRole:  subject.role,
        action,
        resourceKind: kind,
        resourceId:   id,
        decision:     decision.allow ? "allow" : "deny",
        reason:       decision.allow ? null : decision.reason,
        context:      context ? JSON.stringify(context) : null,
      },
    });
  } catch (err) {
    // The audit log is best-effort. Failing here must not break the
    // request — the authorize() decision is what actually guards the
    // resource. Surface the failure so it shows up in CloudWatch later.
    console.warn("[audit] failed to write AuthorizationLog", { action, err });
  }
}
