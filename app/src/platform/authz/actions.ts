/**
 * Action vocabulary — every authorization decision in the app references
 * one of these strings. Defined in one place so the matrix is auditable
 * and the FastAPI side can consume the same list (YAML mirror to be added
 * when the migration begins).
 *
 * Naming convention: `resource:operation[.modifier]`
 *   - `project:read`        → read any field of a project
 *   - `project:update`      → edit any field of a project
 *   - `project:update.status` → narrow form: only workStatus may change
 *
 * If you add an action here, you MUST also add a branch in
 * `src/lib/auth/authorize.ts`. Authorize falls through to "deny" if it
 * doesn't recognise the action — that's intentional (closed-world default).
 */

export const ACTIONS = {
  // ── Projects ──────────────────────────────────────────────
  "project:create":         "Create a new project",
  "project:read":           "View project details",
  "project:update":         "Edit project fields",
  "project:update.status":  "Change project workStatus only",
  "project:delete":         "Delete a project",
  "project:assign":         "Add or remove team members",
  "project:status.post":    "Post a structured status update",
  "project:status.delete":  "Delete a status update",

  // ── Project threads ───────────────────────────────────────
  "thread:read":            "Read a project-scoped thread",
  "thread:post":            "Post in a project-scoped thread",

  // ── Oversight (aggregate views across people/projects) ────
  "project:health.read":    "View cross-project health and attention flags",
  "team:workload.read":     "View aggregate team workload",

  // ── Users / team ──────────────────────────────────────────
  "user:read":              "Read user records",
  "user:invite":            "Invite a new user",
  "user:invite.external":   "Invite an address outside the practice as a guest",
  "user:update":            "Edit a user (admin)",
  "user:role.change":       "Change a user's global role",
  "user:delete":            "Deactivate or delete a user",
  "user:regions.manage":    "Edit a user's regional access",

  // ── Agenda ────────────────────────────────────────────────
  "agenda:create":          "Create an agenda item",
  "agenda:read":            "Read agenda items",
  "agenda:update":          "Update an agenda item",
  "agenda:delete":          "Delete an agenda item",

  // ── Chat ──────────────────────────────────────────────────
  "chat:read":              "Read messages in a channel",
  "chat:post":              "Post a message in a channel",
  "chat:react":             "React to a message",
  "chat:message.update":    "Edit own message",
  "chat:message.delete":    "Delete a message",

  // ── Sheets ────────────────────────────────────────────────
  "sheet:create":           "Create a sheet",
  "sheet:read":             "Read a sheet",
  "sheet:update":           "Edit a sheet",
  "sheet:delete":           "Delete a sheet",

  // ── Tasks ─────────────────────────────────────────────────
  "task:create":            "Create a task",
  "task:read":              "Read tasks",
  "task:update":            "Update a task",
  "task:delete":            "Delete a task",

  // ── AI ────────────────────────────────────────────────────
  "ai:invoke":              "Invoke an AI feature (summary, agent, etc.)",
  "ai:saved.read":          "Read saved AI responses",

  // ── Billing ───────────────────────────────────────────────
  "billing:read":           "View billing / plan / usage",
  "billing:manage":         "Change plan or payment methods",

  // ── Settings ──────────────────────────────────────────────
  "settings:self.read":          "Read own profile/preferences",
  "settings:self.update":        "Update own profile/preferences",
  "settings:workspace.read":     "Read workspace settings",
  "settings:workspace.update":   "Update workspace settings",
  "settings:permissions.read":   "Read the permission matrix",
  "settings:permissions.update": "Edit the permission matrix",
  "settings:integrations.manage": "Connect/disconnect workspace integrations",
} as const;

export type Action = keyof typeof ACTIONS;

/** Type guard for callers that have a raw string from the wire. */
export function isAction(s: string): s is Action {
  return Object.prototype.hasOwnProperty.call(ACTIONS, s);
}

/** All actions, sorted — useful for the Settings → Permissions UI. */
export const ALL_ACTIONS: readonly Action[] = Object.freeze(
  (Object.keys(ACTIONS) as Action[]).slice().sort()
);
