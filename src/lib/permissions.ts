/**
 * Friday.com — Role & Permission Model
 *
 * permission = role capability + scope + region
 *
 * Role hierarchy (most → least privileged):
 *   admin > director > manager > employee > intern
 *
 * Legacy aliases kept for DB backwards-compatibility:
 *   super_admin  → treated as admin
 *   project_manager → treated as manager
 *   viewer / collaborator → treated as employee
 */

// ─── Role predicates ─────────────────────────────────────────

const ADMIN_ROLES    = new Set(["admin", "super_admin"]);
const DIRECTOR_ROLES = new Set(["admin", "super_admin", "director"]);
const MANAGER_ROLES  = new Set(["admin", "super_admin", "director", "manager", "project_manager"]);
const WRITE_ROLES    = new Set(["admin", "super_admin", "director", "manager", "project_manager", "employee", "collaborator"]);

export function isAdmin(role: string): boolean {
  return ADMIN_ROLES.has(role);
}

export function isDirectorOrAbove(role: string): boolean {
  return DIRECTOR_ROLES.has(role);
}

export function isManagerOrAbove(role: string): boolean {
  return MANAGER_ROLES.has(role);
}

export function canWrite(role: string): boolean {
  return WRITE_ROLES.has(role);
}

/** Interns have restricted write access */
export function isIntern(role: string): boolean {
  return role === "intern";
}

// ─── Capability checks ───────────────────────────────────────

/** Can create new projects */
export function canCreateProject(role: string): boolean {
  return isManagerOrAbove(role);
}

/** Can edit any project (not just assigned ones) */
export function canEditAnyProject(role: string): boolean {
  return isDirectorOrAbove(role);
}

/** Can manage users (invite, change role, deactivate) */
export function canManageUsers(role: string): boolean {
  return isAdmin(role);
}

/** Can view financial / billing fields */
export function canViewBilling(role: string): boolean {
  return isDirectorOrAbove(role);
}

/** Can access analytics & statistics */
export function canViewAnalytics(role: string): boolean {
  return isDirectorOrAbove(role);
}

/** Can view and run AI agent queries */
export function canUseAI(role: string): boolean {
  return isManagerOrAbove(role);
}

/** Can delete records (hard) */
export function canDelete(role: string): boolean {
  return isAdmin(role);
}

/** Can access system settings */
export function canManageSystem(role: string): boolean {
  return isAdmin(role);
}

// ─── Region checks ───────────────────────────────────────────

export type RegionAccess = {
  country: string;
  operatingRegion?: string | null;
  accessLevel: "view" | "manage";
};

/**
 * Returns true if the user can access (view or manage) the given country.
 * Admins and directors always have global access.
 */
export function canAccessCountry(
  role: string,
  regionAccess: RegionAccess[],
  country: string
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
  country: string
): boolean {
  if (isAdmin(role)) return true;
  return regionAccess.some(
    (r) => r.country === country && r.accessLevel === "manage"
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
