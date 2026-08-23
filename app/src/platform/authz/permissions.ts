/**
 * Friday.com — Role & Permission Model (legacy convenience predicates).
 *
 * Every function in this file is now a thin wrapper over the single
 * authorize() decision function in @/platform/authz. The convenience names
 * stay so the ~139 existing callers don't need touching; new code
 * should prefer authorize() / requirePermission() directly.
 *
 * Role hierarchy (most → least privileged):
 *   admin > director > manager > employee > intern
 *
 * Legacy aliases kept for DB backwards-compatibility:
 *   super_admin    → treated as admin
 *   project_manager → treated as manager
 *   viewer / collaborator → treated as employee
 */

import { authorize, type RegionAccess as AuthRegionAccess, type Subject } from "@/platform/authz/authorize";

// Re-export the canonical RegionAccess type so legacy callers continue
// to import it from "@/platform/authz/permissions".
export type RegionAccess = AuthRegionAccess;

// ─── Subject builder (private — predicates need a Subject) ─────

function subject(role: string, regions: RegionAccess[] = []): Subject {
  return { userId: "__predicate__", role, isExternal: false, regions };
}

// ─── Role predicates ─────────────────────────────────────────

const ADMIN_ROLES    = new Set(["admin", "super_admin"]);
const DIRECTOR_ROLES = new Set(["admin", "super_admin", "director"]);
const MANAGER_ROLES  = new Set(["admin", "super_admin", "director", "manager", "project_manager"]);
const WRITE_ROLES    = new Set(["admin", "super_admin", "director", "manager", "project_manager", "employee", "collaborator"]);

export function isAdmin(role: string): boolean { return ADMIN_ROLES.has(role); }
export function isDirectorOrAbove(role: string): boolean { return DIRECTOR_ROLES.has(role); }
export function isManagerOrAbove(role: string): boolean { return MANAGER_ROLES.has(role); }
export function canWrite(role: string): boolean { return WRITE_ROLES.has(role); }
export function isIntern(role: string): boolean { return role === "intern"; }

// ─── Capability checks (wrappers over authorize) ──────────────

/** Can create new projects. */
export function canCreateProject(role: string): boolean {
  return authorize(subject(role), "project:create", null).allow;
}

/** Can edit any project (regardless of assignment). */
export function canEditAnyProject(role: string): boolean {
  return isDirectorOrAbove(role);
}

/** Can manage users (invite, change role, deactivate). */
export function canManageUsers(role: string): boolean {
  return authorize(subject(role), "user:invite", null).allow;
}

/** Can view financial / billing fields. */
export function canViewBilling(role: string): boolean {
  return authorize(subject(role), "billing:read", { kind: "billing" }).allow;
}

/** Can access analytics & statistics. */
export function canViewAnalytics(role: string): boolean {
  return isDirectorOrAbove(role);
}

/** Can view and run AI agent queries. */
export function canUseAI(role: string): boolean {
  return authorize(subject(role), "ai:invoke", { kind: "ai" }).allow;
}

/** Can hard-delete records. */
export function canDelete(role: string): boolean {
  return isAdmin(role);
}

/** Can access system settings. */
export function canManageSystem(role: string): boolean {
  return authorize(subject(role), "settings:workspace.update", {
    kind: "settings",
    scope: "workspace",
  }).allow;
}

// ─── Region checks ───────────────────────────────────────────

/**
 * Returns true if the user can access (view or manage) the given country.
 * Admins and directors always have global access.
 */
export function canAccessCountry(
  role: string,
  regionAccess: RegionAccess[],
  country: string,
): boolean {
  if (isDirectorOrAbove(role)) return true;
  return regionAccess.some((r) => r.country === country);
}

/**
 * Returns true if the user can MANAGE (not just view) the given country.
 */
export function canManageCountry(
  role: string,
  regionAccess: RegionAccess[],
  country: string,
): boolean {
  if (isAdmin(role)) return true;
  return regionAccess.some(
    (r) => r.country === country && r.accessLevel === "manage",
  );
}

/**
 * Derives the default permission set for a role.
 * Used when creating a new user to set the legacy canCreate/canEdit/canDelete flags.
 */
export function defaultPermissionsForRole(role: string): {
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
} {
  return {
    canCreate: canCreateProject(role),
    canEdit:   canWrite(role),
    canDelete: canDelete(role),
  };
}
