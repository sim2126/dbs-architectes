/**
 * authorize() — the single decision function for the whole app.
 *
 *   (subject, action, resource, context) → { allow } | { allow: false, reason }
 *
 * Anything that asks "is this user allowed to do this thing?" routes
 * through here. The convenience predicates in `src/lib/permissions.ts`
 * are thin wrappers over this function so the rules live in exactly
 * one place.
 *
 * Closed-world default: an unknown action returns deny.
 *
 * See `feedback_auth_architecture` in the auto-memory for the
 * architectural rationale (the function must be callable from any
 * layer — route, service, server component, background worker).
 */

import type { Action } from "./actions";

// ─── Subject ──────────────────────────────────────────────────────

export type RegionAccess = {
  country: string;
  operatingRegion?: string | null;
  accessLevel: "view" | "manage";
};

export type Subject = {
  userId: string;
  /** Global workspace role, normalised. May be a legacy alias — keep raw. */
  role: string;
  regions: RegionAccess[];
};

// ─── Resource — discriminated union per resource kind ─────────────

export type ProjectResource = {
  kind: "project";
  id: string;
  country?: string | null;
  /**
   * The caller's ProjectAssignment.role on THIS project, or null if the
   * caller has no assignment. Loaders in requirePermission() resolve this.
   */
  assignmentRole?: string | null;
};

export type UserResource = {
  kind: "user";
  /** The user being acted on. */
  id: string;
};

export type AgendaResource = {
  kind: "agenda";
  /** The user who owns the agenda item. */
  userId: string;
  projectId?: string | null;
};

export type ChatResource = {
  kind: "chat";
  channelId: string;
  /** When acting on a specific message, the author's userId. */
  messageUserId?: string;
};

export type SheetResource = {
  kind: "sheet";
  ownerId: string;
};

export type TaskResource = {
  kind: "task";
  userId: string;
  projectId?: string | null;
};

export type BillingResource = { kind: "billing" };

export type AiResource = { kind: "ai" };

export type SettingsResource = {
  kind: "settings";
  scope: "self" | "workspace" | "permissions" | "integrations";
  /** For "self" scope, the user whose settings are being edited. */
  targetUserId?: string;
};

export type Resource =
  | ProjectResource
  | UserResource
  | AgendaResource
  | ChatResource
  | SheetResource
  | TaskResource
  | BillingResource
  | AiResource
  | SettingsResource
  | null;

// ─── Decision ─────────────────────────────────────────────────────

export type Decision =
  | { allow: true }
  | { allow: false; reason: string };

export type AuthContext = {
  now?: Date;
};

// ─── Role-tier helpers (private, used by authorize() only) ────────

const ADMIN_ROLES    = new Set(["admin", "super_admin"]);
const DIRECTOR_ROLES = new Set(["admin", "super_admin", "director"]);
const MANAGER_ROLES  = new Set(["admin", "super_admin", "director", "manager", "project_manager"]);
const WRITE_ROLES    = new Set(["admin", "super_admin", "director", "manager", "project_manager", "employee", "collaborator"]);

function isAdmin(role: string): boolean       { return ADMIN_ROLES.has(role); }
function isDirector(role: string): boolean    { return DIRECTOR_ROLES.has(role); }
function isManager(role: string): boolean     { return MANAGER_ROLES.has(role); }
function isWriter(role: string): boolean      { return WRITE_ROLES.has(role); }

/**
 * Normalise the per-project assignment role into a capability tier.
 *   lead    — full project control except delete
 *   editor  — edit content, post threads, edit agenda
 *   reviewer — read + comment
 *   viewer  — read only
 *
 * Tolerates the seed values "director" (= lead) and "architect" (= editor)
 * so existing data continues to work.
 */
type AssignmentTier = "lead" | "editor" | "reviewer" | "viewer" | "none";
function assignmentTier(role?: string | null): AssignmentTier {
  if (!role) return "none";
  const r = role.toLowerCase();
  if (r === "lead" || r === "director" || r === "owner") return "lead";
  if (r === "editor" || r === "architect" || r === "member") return "editor";
  if (r === "reviewer") return "reviewer";
  if (r === "viewer") return "viewer";
  return "viewer";
}

function isAssigned(tier: AssignmentTier): boolean {
  return tier !== "none";
}

function canEditProjectByAssignment(tier: AssignmentTier): boolean {
  return tier === "lead" || tier === "editor";
}

function canRegionAccess(subject: Subject, country: string | null | undefined): boolean {
  if (!country) return true; // un-scoped projects are visible firm-wide
  if (isDirector(subject.role)) return true;
  return subject.regions.some((r) => r.country === country);
}

function deny(reason: string): Decision { return { allow: false, reason }; }
const ALLOW: Decision = { allow: true };

// ─── The decision function ────────────────────────────────────────

export function authorize(
  subject: Subject,
  action: Action,
  resource: Resource,
  _context?: AuthContext,
): Decision {
  // Universal admin bypass (kept narrow — admin still can't impersonate
  // self-only actions targeted at other users; handled per-branch).
  // We don't auto-allow here; each branch decides.

  switch (action) {
    // ── Projects ──────────────────────────────────────────────
    case "project:create":
      return isManager(subject.role)
        ? ALLOW
        : deny("Only managers or above can create projects.");

    case "project:read": {
      if (resource?.kind !== "project") return deny("Resource must be a project.");
      if (!canRegionAccess(subject, resource.country))
        return deny("You don't have access to projects in this country.");
      return ALLOW;
    }

    case "project:update": {
      if (resource?.kind !== "project") return deny("Resource must be a project.");
      if (isDirector(subject.role)) return ALLOW;
      if (!canRegionAccess(subject, resource.country))
        return deny("You don't have access to projects in this country.");
      const tier = assignmentTier(resource.assignmentRole);
      if (canEditProjectByAssignment(tier)) return ALLOW;
      if (isManager(subject.role)) return ALLOW;
      return deny("Only project leads/editors or managers can update this project.");
    }

    case "project:update.status": {
      if (resource?.kind !== "project") return deny("Resource must be a project.");
      if (isManager(subject.role)) return ALLOW;
      if (isAssigned(assignmentTier(resource.assignmentRole))) return ALLOW;
      return deny("Only assignees or managers can change project status.");
    }

    case "project:delete":
      return isAdmin(subject.role)
        ? ALLOW
        : deny("Only admins can delete projects.");

    case "project:assign": {
      if (resource?.kind !== "project") return deny("Resource must be a project.");
      if (isDirector(subject.role)) return ALLOW;
      if (assignmentTier(resource.assignmentRole) === "lead") return ALLOW;
      return deny("Only directors or project leads can assign team members.");
    }

    // ── Threads (per-project) ─────────────────────────────────
    case "thread:read": {
      if (resource?.kind !== "project") return deny("Resource must be a project.");
      if (!canRegionAccess(subject, resource.country))
        return deny("You don't have access to this project's thread.");
      return ALLOW;
    }

    case "thread:post": {
      if (resource?.kind !== "project") return deny("Resource must be a project.");
      if (!isWriter(subject.role)) return deny("Read-only roles cannot post.");
      if (!canRegionAccess(subject, resource.country))
        return deny("You don't have access to this project's thread.");
      // Anyone with write role + region access can post; assignment helps but isn't required
      return ALLOW;
    }

    // ── Users ─────────────────────────────────────────────────
    case "user:read":
      // Any signed-in user can read the team directory
      return ALLOW;

    case "user:invite":
    case "user:update":
    case "user:role.change":
    case "user:delete":
    case "user:regions.manage":
      return isAdmin(subject.role)
        ? ALLOW
        : deny("Only admins can manage users.");

    // ── Agenda ────────────────────────────────────────────────
    case "agenda:create":
      return isWriter(subject.role)
        ? ALLOW
        : deny("Read-only roles cannot create agenda items.");

    case "agenda:read":
    case "agenda:update":
    case "agenda:delete": {
      if (resource?.kind !== "agenda") return deny("Resource must be an agenda item.");
      // Own agenda always permitted
      if (resource.userId === subject.userId) return ALLOW;
      // Managers and above can manage anyone's agenda
      if (isManager(subject.role)) return ALLOW;
      return deny("You can only manage your own agenda items.");
    }

    // ── Chat ──────────────────────────────────────────────────
    case "chat:read":
      // Channel membership enforced separately at the data layer
      return ALLOW;

    case "chat:post":
    case "chat:react":
      return isWriter(subject.role)
        ? ALLOW
        : deny("Read-only roles cannot post or react.");

    case "chat:message.update": {
      if (resource?.kind !== "chat") return deny("Resource must be a chat message.");
      // Only the author may edit; admins do not edit others' messages
      if (resource.messageUserId === subject.userId) return ALLOW;
      return deny("You can only edit your own messages.");
    }

    case "chat:message.delete": {
      if (resource?.kind !== "chat") return deny("Resource must be a chat message.");
      if (resource.messageUserId === subject.userId) return ALLOW;
      if (isAdmin(subject.role)) return ALLOW;
      return deny("You can only delete your own messages.");
    }

    // ── Sheets ────────────────────────────────────────────────
    case "sheet:create":
      return isWriter(subject.role) ? ALLOW : deny("Read-only roles cannot create sheets.");

    case "sheet:read":
      // Anyone signed in can read a sheet; finer scoping (per-sheet sharing)
      // can layer on top later.
      return ALLOW;

    case "sheet:update":
    case "sheet:delete": {
      if (resource?.kind !== "sheet") return deny("Resource must be a sheet.");
      if (resource.ownerId === subject.userId) return ALLOW;
      if (isAdmin(subject.role)) return ALLOW;
      return deny("Only the owner or an admin can change this sheet.");
    }

    // ── Tasks ─────────────────────────────────────────────────
    case "task:create":
      return isWriter(subject.role) ? ALLOW : deny("Read-only roles cannot create tasks.");

    case "task:read":
    case "task:update":
    case "task:delete": {
      if (resource?.kind !== "task") return deny("Resource must be a task.");
      if (resource.userId === subject.userId) return ALLOW;
      if (isManager(subject.role)) return ALLOW;
      return deny("You can only manage your own tasks.");
    }

    // ── AI ────────────────────────────────────────────────────
    case "ai:invoke":
      return isManager(subject.role)
        ? ALLOW
        : deny("AI features are limited to managers and above.");

    case "ai:saved.read":
      return ALLOW;

    // ── Billing ───────────────────────────────────────────────
    case "billing:read":
      return isDirector(subject.role)
        ? ALLOW
        : deny("Only directors and admins can view billing.");

    case "billing:manage":
      return isAdmin(subject.role)
        ? ALLOW
        : deny("Only admins can change billing.");

    // ── Settings ──────────────────────────────────────────────
    case "settings:self.read":
    case "settings:self.update": {
      if (resource?.kind !== "settings") return deny("Resource must be settings.");
      if (resource.scope !== "self") return deny("Self-scope required.");
      const target = resource.targetUserId ?? subject.userId;
      if (target !== subject.userId)
        return deny("You can only edit your own profile through self-settings.");
      return ALLOW;
    }

    case "settings:workspace.read":
    case "settings:workspace.update":
    case "settings:integrations.manage":
      return isAdmin(subject.role)
        ? ALLOW
        : deny("Only admins can change workspace settings.");

    case "settings:permissions.read":
      return isAdmin(subject.role)
        ? ALLOW
        : deny("Only admins can view the permission matrix.");

    case "settings:permissions.update":
      return isAdmin(subject.role)
        ? ALLOW
        : deny("Only admins can edit the permission matrix.");
  }

  // Closed-world default — exhaustiveness check at compile time.
  const _exhaust: never = action;
  void _exhaust;
  return deny("Unknown action.");
}
