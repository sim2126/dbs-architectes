/**
 * Barrel for the auth/authorization layer. New code should import from
 * "@/lib/auth" rather than from the individual files.
 *
 * The legacy "@/lib/permissions" module re-exports the convenience
 * predicates (isAdmin, canCreateProject, etc.) — those are kept for
 * backwards compatibility and are now thin wrappers over authorize().
 */

export { ACTIONS, ALL_ACTIONS, isAction, type Action } from "./actions";

export {
  authorize,
  type AuthContext,
  type Decision,
  type RegionAccess,
  type Resource,
  type Subject,
  type ProjectResource,
  type UserResource,
  type AgendaResource,
  type ChatResource,
  type SheetResource,
  type TaskResource,
  type BillingResource,
  type AiResource,
  type SettingsResource,
} from "./authorize";

export {
  logAuthorizationDecision,
  type AuditContext,
} from "./audit";

export {
  requirePermission,
  permissionResponse,
  loadProjectForAuth,
  PermissionError,
  type RequireOptions,
} from "./require-permission";
