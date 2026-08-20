/**
 * loadPermissionGrants — the Settings → Permissions payload.
 *
 * Returns every active workspace member with any per-user overrides they
 * currently hold. Sized for a roster of ~50–200 people; a single request.
 *
 * Authorization is the caller's concern. This trusts that the route already
 * cleared `settings:permissions.read`.
 */

import { prisma } from "@/platform/db";
import { isAction, type Action } from "@/platform/authz";

export type GrantRow = {
  action: Action;
  effect: "allow" | "deny";
  reason: string | null;
  expiresAt: string | null;
  grantedBy: { id: string; name: string | null; email: string } | null;
  createdAt: string;
};

export type PermissionSubjectRow = {
  user: {
    id: string;
    name: string | null;
    email: string;
    initials: string | null;
    image: string | null;
    role: string;
  };
  grants: GrantRow[];
};

export async function loadPermissionGrants(): Promise<PermissionSubjectRow[]> {
  const now = new Date();

  const users = await prisma.user.findMany({
    where: { isActive: true },
    orderBy: [{ name: "asc" }],
    select: {
      id: true,
      name: true,
      email: true,
      initials: true,
      image: true,
      role: true,
      isExternal: true,
      permissionGrants: {
        // Expired grants are excluded here for the same reason loadSubject
        // excludes them: showing an expired grant as active would mislead
        // an admin into thinking access exists that authorize() will deny.
        where: { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
        select: {
          action: true,
          effect: true,
          reason: true,
          expiresAt: true,
          createdAt: true,
          grantedBy: { select: { id: true, name: true, email: true } },
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  return users.map((u) => ({
    user: {
      id: u.id,
      name: u.name,
      email: u.email,
      initials: u.initials,
      image: u.image,
      role: u.role,
    },
    // Rows naming an action no longer in the vocabulary are dropped, matching
    // loadSubject's validation. The UI must not offer to manage a grant that
    // authorize() would ignore.
    grants: u.permissionGrants.flatMap((g): GrantRow[] => {
      if (!isAction(g.action)) return [];
      if (g.effect !== "allow" && g.effect !== "deny") return [];
      return [
        {
          action: g.action,
          effect: g.effect,
          reason: g.reason,
          expiresAt: g.expiresAt ? g.expiresAt.toISOString() : null,
          createdAt: g.createdAt.toISOString(),
          grantedBy: g.grantedBy
            ? { id: g.grantedBy.id, name: g.grantedBy.name, email: g.grantedBy.email }
            : null,
        },
      ];
    }),
  }));
}
