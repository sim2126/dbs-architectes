/**
 * Projects feature — public API surface.
 *
 * Routes and other features compose Projects through this barrel.
 * Anything not re-exported here is private to the feature (server/
 * helpers, internal client components, etc.). If you find yourself
 * deep-importing from "@/features/projects/client/something", that's
 * a signal — either the thing should be exported here, or your code
 * belongs inside the feature.
 *
 * Naming reminder (CLAUDE.md §arch): components are noun-first
 * kebab-case; the `-client` suffix is dropped inside client/ because
 * the folder already implies that role.
 */

// Client components and the public types that flow between them
export { ProjectDetail } from "./client/project-detail";
export { ProjectsExplorer } from "./client/projects-explorer";
export { ProjectThreadPanel } from "./client/project-thread-panel";

// Domain — pure types, safe to import from either side
export type {
  ProjectDetailData,
  ProjectSummary,
  ProjectAssignmentRow,
  ProjectAgendaRow,
  ProjectActivityRow,
  ProjectFileRow,
  ProjectThreadRow,
} from "./domain/types";
export {
  parseProjectPageQuery,
  projectMatchesPageQuery,
} from "./domain/project-page-query";
export type {
  ProjectPageQuery,
  ProjectWorkStatus,
} from "./domain/project-page-query";
export {
  CANONICAL_PROJECT_PHASES,
  DEFAULT_PROJECT_PHASE,
  normaliseProjectPhase,
} from "./domain/phase-helpers";

// Server functions are intentionally NOT re-exported here. Route
// handlers reach for them via deep imports
//   import { loadProjectDetail } from "@/features/projects/server/load-project-detail"
// to keep server-only code (prisma, etc.) out of client bundles.
