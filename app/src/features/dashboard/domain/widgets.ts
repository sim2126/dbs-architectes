/**
 * Dashboard widget registry.
 *
 * Every dashboard surface declares the authorization it requires. Visibility
 * is then *derived* by running the existing authorize() decision function —
 * it is never decided by a role switch.
 *
 * Why this exists: the dashboard previously mapped roles onto three hardcoded
 * tiers (admin / lead / employee) in parallel with the real permission
 * vocabulary. Two sources of truth for "what can this person see" drift, and
 * the role switch cannot be configured without a deploy.
 *
 * ── What this is NOT ──────────────────────────────────────────────
 *
 * Widget visibility is a CAPABILITY probe, not row-level authorization.
 * "Should this surface exist for this person?" — not "which rows may they
 * see?". Loaders still filter rows by region, assignment and ownership.
 * Never treat a visible widget as permission to show unfiltered data.
 */

import { authorize, type Resource, type Subject } from "@/platform/authz/authorize";
import type { Action } from "@/platform/authz/actions";

export type DashboardSlot = "kpi" | "primary" | "secondary";

export type WidgetId =
  | "kpi.projects.active"
  | "kpi.projects.progress"
  | "kpi.projects.blocked"
  | "kpi.meetings.upcoming"
  | "today-focus"
  | "what-changed"
  | "starred"
  | "needs-attention"
  | "team-load";

/**
 * A capability requirement. `resource` is a *representative* resource used
 * only to exercise the decision branch — never a real record.
 */
type Requirement = { action: Action; resource: Resource };

export type WidgetDescriptor = {
  id: WidgetId;
  slot: DashboardSlot;
  /** Ascending. Ties broken by declaration order. */
  order: number;
  /** Every requirement must pass. Empty means always visible. */
  requires: readonly Requirement[];
};

function anyProject(): Resource {
  return { kind: "project", id: "__probe__", country: null };
}

/**
 * The registry. Order here is the order on screen within a slot.
 *
 * KPI slot is capped at three by design — see docs/frontend/04: three tiers
 * of information, and a glance row of twelve numbers is a report, not a
 * dashboard. If a fourth KPI is added, one must be removed or demoted.
 */
export const DASHBOARD_WIDGETS: readonly WidgetDescriptor[] = [
  {
    id: "kpi.projects.active",
    slot: "kpi",
    order: 10,
    requires: [{ action: "project:read", resource: anyProject() }],
  },
  {
    id: "kpi.projects.progress",
    slot: "kpi",
    order: 20,
    requires: [{ action: "project:read", resource: anyProject() }],
  },
  {
    id: "kpi.meetings.upcoming",
    slot: "kpi",
    order: 30,
    // Own agenda — every signed-in user qualifies.
    requires: [],
  },
  {
    id: "kpi.projects.blocked",
    slot: "kpi",
    order: 40,
    requires: [{ action: "project:read", resource: anyProject() }],
  },
  {
    id: "today-focus",
    slot: "primary",
    order: 10,
    requires: [],
  },
  {
    id: "what-changed",
    slot: "primary",
    order: 20,
    requires: [{ action: "project:read", resource: anyProject() }],
  },
  {
    id: "needs-attention",
    slot: "primary",
    order: 30,
    requires: [{ action: "project:health.read", resource: null }],
  },
  {
    id: "team-load",
    slot: "secondary",
    order: 10,
    requires: [{ action: "team:workload.read", resource: null }],
  },
  {
    id: "starred",
    slot: "secondary",
    order: 20,
    requires: [{ action: "project:read", resource: anyProject() }],
  },
];

/** True if the subject satisfies every requirement of the widget. */
export function canSeeWidget(subject: Subject, widget: WidgetDescriptor): boolean {
  return widget.requires.every((r) => authorize(subject, r.action, r.resource).allow);
}

/**
 * Visible widgets for a subject, grouped by slot and ordered.
 *
 * Pure. No database access, no session lookup — pass a Subject and get a
 * deterministic answer. That is what makes this testable and what lets the
 * same function drive both the server render and any future preview UI
 * ("show me what a project manager sees").
 */
export function resolveDashboardWidgets(
  subject: Subject,
): Record<DashboardSlot, WidgetId[]> {
  const visible = DASHBOARD_WIDGETS.filter((w) => canSeeWidget(subject, w)).sort(
    (a, b) => a.order - b.order,
  );

  return {
    kpi: visible.filter((w) => w.slot === "kpi").map((w) => w.id),
    primary: visible.filter((w) => w.slot === "primary").map((w) => w.id),
    secondary: visible.filter((w) => w.slot === "secondary").map((w) => w.id),
  };
}

/**
 * KPI slot is capped at three on screen. The registry declares four
 * candidates so the set degrades sensibly: a user who cannot read projects
 * still gets a populated glance row rather than an empty one.
 */
export const KPI_LIMIT = 3;

export function resolveKpis(subject: Subject): WidgetId[] {
  return resolveDashboardWidgets(subject).kpi.slice(0, KPI_LIMIT);
}
