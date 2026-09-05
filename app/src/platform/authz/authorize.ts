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

/**
 * A per-user override of the role-derived default, loaded once per request.
 *
 * Deliberately NOT carried in the JWT. Token-lifetime permission snapshots
 * are a documented anti-pattern: an admin revoking access has no effect
 * until the token expires. Grants are read where the Subject is built, so
 * they are at most one request stale and a revocation lands immediately.
 *
 * Keeping them on the Subject is what lets authorize() stay pure and
 * synchronous — the alternative (an async DB lookup inside authorize)
 * would make every one of its ~139 call sites async.
 */
export type PermissionGrant = {
  action: Action;
  effect: "allow" | "deny";
};

export type Subject = {
  userId: string;
  /** Global workspace role, normalised. May be a legacy alias — keep raw. */
  role: string;
  /** Outside the practice. External users are conversation-scoped. */
  isExternal: boolean;
  regions: RegionAccess[];
  /** Per-user overrides. Absent means "role defaults only". */
  grants?: readonly PermissionGrant[];
};

// ─── Resource — discriminated union per resource kind ─────────────

export type ProjectResource = {
  kind: "project";
  id: string;
  country?: string | null;
  operatingRegion?: string | null;
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
  /** Channel-level membership management is restricted to its custodians. */
  channelOwnerId?: string;
  channelMemberRole?: string | null;
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

export function canRegionAccess(
  subject: Subject,
  project: Pick<ProjectResource, "country" | "operatingRegion">,
  access: "view" | "manage" = "view",
): boolean {
  const { country, operatingRegion } = project;
  if (!country) return true; // un-scoped projects are visible firm-wide
  if (isDirector(subject.role)) return true;
  return subject.regions.some((r) =>
    r.country === country &&
    (!r.operatingRegion || r.operatingRegion === operatingRegion) &&
    (r.accessLevel === "manage" || (access === "view" && r.accessLevel === "view")),
  );
}

/**
 * Which regions this subject may see projects in. `null` means no
 * restriction at all.
 *
 * canRegionAccess() answers the question one project at a time, which is the
 * right shape for a decision and the wrong shape for a list: asking it per
 * row means fetching rows in order to discard them. This states the same rule
 * as a set the query can be built from, and lives here so the two cannot
 * drift — a list that shows more than the detail view will open is a leak of
 * titles, clients and communes across a boundary the practice cares about.
 *
 * Projects with no country are visible to everyone, matching canRegionAccess.
 */
export function readableProjectRegions(subject: Subject): readonly RegionAccess[] | null {
  if (isDirector(subject.role)) return null;
  return subject.regions.filter((r) => r.accessLevel === "view" || r.accessLevel === "manage");
}

function deny(reason: string): Decision { return { allow: false, reason }; }
const ALLOW: Decision = { allow: true };

// ─── The decision function ────────────────────────────────────────

/**
 * Actions whose decision is purely role-derived — no region, assignment or
 * ownership logic in their branch. Only these may be granted by an override.
 *
 * Resource-scoped actions (project:read, agenda:update, chat:message.delete…)
 * are deliberately excluded: an allow-override on project:read would bypass
 * region scoping and hand a user the whole portfolio. Widening those is a
 * change to their branch, not something an admin toggles.
 *
 * A DENY override applies to every action regardless of this set — removing
 * access is always safe to honour.
 */
/// NO-ESCALATION INVARIANT
///
/// `settings:permissions.update` is deliberately absent from this set and
/// must never be added. If an allow-grant could confer it, any holder of a
/// single grant could grant themselves every other grantable action — the
/// permission system would become self-modifying by anyone who touched it.
///
/// Enforced by a test in features/dashboard/domain/widgets.test.ts.
/// Changing this set is a security decision, not a convenience one.
const OVERRIDABLE_ACTIONS: ReadonlySet<Action> = new Set<Action>([
  "project:create",
  "project:health.read",
  "team:workload.read",
  "user:invite",
  "billing:read",
  "ai:invoke",
  "settings:workspace.read",
  "settings:permissions.read",
]);

/** Actions an admin may grant with effect "allow". Deny applies to any action. */
export function isOverridableAction(action: Action): boolean {
  return OVERRIDABLE_ACTIONS.has(action);
}

/** The grantable set, sorted — drives the Settings → Permissions UI. */
export const GRANTABLE_ACTIONS: readonly Action[] = Object.freeze(
  [...OVERRIDABLE_ACTIONS].sort(),
);

export function authorize(
  subject: Subject,
  action: Action,
  resource: Resource,
  _context?: AuthContext,
): Decision {
  void _context;

  // ── Per-user overrides, consulted before role defaults ──────────
  // Deny always wins — over an allow-override and over any role.
  const overrides = subject.grants?.filter((g) => g.action === action);
  if (overrides?.some((g) => g.effect === "deny")) {
    return deny("Access to this action has been revoked for your account.");
  }

  // Guests are admitted to individual conversations, never to workspace
  // surfaces. This check sits ahead of role defaults and allow-grants so an
  // accidentally privileged role or stale grant cannot widen guest access.
  // Channel membership itself is enforced by the chat data-access layer.
  if (
    subject.isExternal &&
    action !== "chat:read" &&
    action !== "chat:post" &&
    action !== "chat:react" &&
    action !== "chat:message.update" &&
    action !== "chat:message.delete" &&
    action !== "settings:self.read" &&
    action !== "settings:self.update"
  ) {
    return deny("Guest access is limited to conversations they have been invited to.");
  }

  // A write must never restore access to a project whose read permission
  // was revoked. The same boundary applies to its threads and status rows.
  if (resource?.kind === "project" && action !== "project:read") {
    if (subject.grants?.some((g) => g.action === "project:read" && g.effect === "deny")) {
      return deny("Access to projects has been revoked for your account.");
    }
    if (!canRegionAccess(subject, resource)) {
      return deny("You don't have access to this project's region.");
    }
  }

  if (overrides?.some((g) => g.effect === "allow") && OVERRIDABLE_ACTIONS.has(action)) {
    return ALLOW;
  }

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
      if (!canRegionAccess(subject, resource))
        return deny("You don't have access to this project's region.");
      return ALLOW;
    }

    case "project:update": {
      if (resource?.kind !== "project") return deny("Resource must be a project.");
      if (isDirector(subject.role)) return ALLOW;
      if (!canRegionAccess(subject, resource, "manage"))
        return deny("You don't have permission to manage this project's region.");
      const tier = assignmentTier(resource.assignmentRole);
      if (canEditProjectByAssignment(tier)) return ALLOW;
      if (isManager(subject.role)) return ALLOW;
      return deny("Only project leads/editors or managers can update this project.");
    }

    case "project:update.status": {
      if (resource?.kind !== "project") return deny("Resource must be a project.");
      if (!canRegionAccess(subject, resource, "manage"))
        return deny("You don't have permission to manage this project's region.");
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
      if (!canRegionAccess(subject, resource, "manage"))
        return deny("You don't have permission to manage this project's region.");
      if (assignmentTier(resource.assignmentRole) === "lead") return ALLOW;
      return deny("Only directors or project leads can assign team members.");
    }

    case "project:status.post": {
      // Posting a structured PM check-in. Same audience as "update.status":
      // any assignee on the project, plus managers/directors firm-wide.
      // Region access is also required — a Swiss-only manager cannot
      // post on an Indian project they have no visibility into.
      if (resource?.kind !== "project") return deny("Resource must be a project.");
      if (!canRegionAccess(subject, resource, "manage"))
        return deny("You don't have permission to manage this project's region.");
      if (isManager(subject.role)) return ALLOW;
      if (isAssigned(assignmentTier(resource.assignmentRole))) return ALLOW;
      return deny("Only assignees or managers can post status updates.");
    }

    case "project:status.delete": {
      // Tighter than post — only managers/directors and the original
      // author should remove a status entry. Author scoping is enforced
      // by the route (not the policy) because we don't carry the
      // status row's authorId in Resource here. The route compares
      // subject.userId to the row's authorId before allowing.
      if (resource?.kind !== "project") return deny("Resource must be a project.");
      if (!canRegionAccess(subject, resource, "manage"))
        return deny("You don't have permission to manage this project's region.");
      if (isManager(subject.role)) return ALLOW;
      if (assignmentTier(resource.assignmentRole) === "lead") return ALLOW;
      return deny("Only project leads or managers can delete status updates.");
    }

    // ── Threads (per-project) ─────────────────────────────────
    case "thread:read": {
      if (resource?.kind !== "project") return deny("Resource must be a project.");
      if (!canRegionAccess(subject, resource))
        return deny("You don't have access to this project's thread.");
      if (!isAssigned(assignmentTier(resource.assignmentRole)))
        return deny("Only assigned project members can read this project's thread.");
      return ALLOW;
    }

    case "thread:post": {
      if (resource?.kind !== "project") return deny("Resource must be a project.");
      if (!isWriter(subject.role)) return deny("Read-only roles cannot post.");
      if (!canRegionAccess(subject, resource))
        return deny("You don't have access to this project's thread.");
      if (!isAssigned(assignmentTier(resource.assignmentRole)))
        return deny("Only assigned project members can post to this project's thread.");
      return ALLOW;
    }

    // ── Users ─────────────────────────────────────────────────
    case "user:read":
      // Any signed-in user can read the team directory
      return ALLOW;

    // ── Oversight ─────────────────────────────────────────────
    // Aggregate views over other people's work. Deliberately NOT
    // gated on user:read — that permits the whole workspace, which
    // is right for a directory and wrong for workload oversight.
    case "project:health.read":
    case "team:workload.read":
      return isManager(subject.role)
        ? ALLOW
        : deny("Only managers or above can view aggregate team and project health.");

    // Admitting a guest is a decision about what an outsider can read, so it
    // is its own action rather than folded into user:invite — it can never
    // be widened by accident. Deliberately absent from OVERRIDABLE_ACTIONS.
    case "user:invite.external":
      return isAdmin(subject.role)
        ? ALLOW
        : deny("Only admins can invite people from outside the practice.");

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

    case "chat:channel.create":
      if (subject.isExternal) return deny("Guests cannot create channels.");
      return isWriter(subject.role)
        ? ALLOW
        : deny("Read-only roles cannot create channels.");

    case "chat:members.manage": {
      if (resource?.kind !== "chat") return deny("Resource must be a chat channel.");
      if (subject.isExternal) return deny("Guests cannot manage channel members.");
      if (isAdmin(subject.role)) return ALLOW;
      if (resource.channelOwnerId === subject.userId) return ALLOW;
      if (resource.channelMemberRole === "owner" || resource.channelMemberRole === "admin") {
        return ALLOW;
      }
      return deny("Only channel owners or admins can add members.");
    }

    case "chat:message.update": {
      if (resource?.kind !== "chat") return deny("Resource must be a chat message.");
      // Only the author may edit; admins do not edit others' messages
      if (resource.messageUserId === subject.userId) return ALLOW;
      return deny("You can only edit your own messages.");
    }

    case "chat:message.delete": {
      if (resource?.kind !== "chat") return deny("Resource must be a chat message.");
      if (resource.messageUserId === subject.userId) return ALLOW;
      if (subject.isExternal) return deny("You can only delete your own messages.");
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
