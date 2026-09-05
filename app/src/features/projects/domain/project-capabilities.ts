/**
 * What the caller may do to each project in a list.
 *
 * The board greys the cells you cannot change, the way Monday does. Working
 * that out in the browser would mean a second copy of the permission rules,
 * and a second copy is a copy that drifts: the real rules combine the
 * workspace role, the region grant and the per-project assignment tier.
 *
 * So the server answers instead. `authorize()` is pure and synchronous, and
 * a listed project already carries the caller's own assignment, so this adds
 * no queries — only the honest answer, alongside the row it describes.
 *
 * The server stays authoritative regardless: these flags decide what is
 * offered, never what is permitted. Every write is checked again on arrival.
 */

import { authorize, type Subject } from "@/platform/authz";

export type ProjectCapabilities = {
  /** May open it at all. False rows must not be returned in a list. */
  read: boolean;
  /** May change any field. */
  update: boolean;
  /** May change workStatus, even without full update. */
  updateStatus: boolean;
  /** May add or remove team members. */
  assign: boolean;
};

type CapabilityProject = {
  id: string;
  country: string | null;
  operatingRegion?: string | null;
  assignments: ReadonlyArray<{ userId: string; role?: string | null }>;
};

export function projectCapabilities(
  subject: Subject,
  project: CapabilityProject,
): ProjectCapabilities {
  const resource = {
    kind: "project" as const,
    id: project.id,
    country: project.country,
    operatingRegion: project.operatingRegion,
    assignmentRole:
      project.assignments.find((a) => a.userId === subject.userId)?.role ?? null,
  };

  return {
    read: authorize(subject, "project:read", resource).allow,
    update: authorize(subject, "project:update", resource).allow,
    updateStatus: authorize(subject, "project:update.status", resource).allow,
    assign: authorize(subject, "project:assign", resource).allow,
  };
}
