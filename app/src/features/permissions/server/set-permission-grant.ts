/**
 * setPermissionGrant / clearPermissionGrant — the write path for per-user
 * permission overrides.
 *
 * Authorization is the caller's concern; the route clears
 * `settings:permissions.update` first. What this module owns is the
 * *integrity* rules that must hold no matter who is calling.
 */

import { prisma } from "@/platform/db";
import { isAction, isOverridableAction, type Action } from "@/platform/authz";

export class GrantError extends Error {
  constructor(readonly reason: string) {
    super(reason);
    this.name = "GrantError";
  }
}

export type SetGrantInput = {
  userId: string;
  action: string;
  effect: string;
  reason?: string | null;
  /** ISO date. Null or absent means the grant does not expire. */
  expiresAt?: string | null;
  /** The admin making the change. Taken from the session, never the body. */
  grantedById: string;
};

export async function setPermissionGrant(input: SetGrantInput): Promise<void> {
  if (!isAction(input.action)) {
    throw new GrantError(`Unknown action: ${input.action}`);
  }
  if (input.effect !== "allow" && input.effect !== "deny") {
    throw new GrantError(`Effect must be "allow" or "deny".`);
  }

  // The escalation guard, enforced at the write boundary as well as at the
  // decision boundary. authorize() already ignores an allow-grant on a
  // non-overridable action, but persisting one would show an admin a grant
  // in the UI that has no effect — a lie in the audit trail.
  if (input.effect === "allow" && !isOverridableAction(input.action)) {
    throw new GrantError(
      `"${input.action}" cannot be granted. Actions with resource-level ` +
        `scoping, and control of the permission matrix itself, are not ` +
        `grantable — widening them is a code change, not a toggle.`,
    );
  }

  let expiresAt: Date | null = null;
  if (input.expiresAt) {
    const parsed = new Date(input.expiresAt);
    if (Number.isNaN(parsed.getTime())) {
      throw new GrantError("expiresAt is not a valid date.");
    }
    if (parsed.getTime() <= Date.now()) {
      throw new GrantError("expiresAt must be in the future.");
    }
    expiresAt = parsed;
  }

  const action = input.action as Action;
  const effect = input.effect;

  await prisma.permissionGrant.upsert({
    where: { userId_action: { userId: input.userId, action } },
    create: {
      userId: input.userId,
      action,
      effect,
      reason: input.reason ?? null,
      expiresAt,
      grantedById: input.grantedById,
    },
    update: {
      effect,
      reason: input.reason ?? null,
      expiresAt,
      // Re-attribute on edit: the last person to change it is the
      // accountable one.
      grantedById: input.grantedById,
    },
  });
}

export async function clearPermissionGrant(
  userId: string,
  action: string,
): Promise<void> {
  if (!isAction(action)) throw new GrantError(`Unknown action: ${action}`);
  await prisma.permissionGrant.deleteMany({
    where: { userId, action },
  });
}
