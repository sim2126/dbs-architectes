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

export { ProjectDetail, type ProjectDetailData } from "./client/project-detail";
export { ProjectsExplorer } from "./client/projects-explorer";
export { ProjectThreadPanel } from "./client/project-thread-panel";
