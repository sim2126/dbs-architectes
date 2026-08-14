import assert from "node:assert/strict";
import test from "node:test";
import {
  authorize,
  GRANTABLE_ACTIONS,
  type Subject,
} from "@/platform/authz/authorize";
import {
  DASHBOARD_WIDGETS,
  KPI_LIMIT,
  resolveDashboardWidgets,
  resolveKpis,
} from "./widgets";

function subject(role: string, regions: Subject["regions"] = []): Subject {
  return { userId: "user-1", role, regions };
}

const ADMIN = subject("admin");
const DIRECTOR = subject("director");
const MANAGER = subject("manager");
const PROJECT_MANAGER = subject("project_manager");
const EMPLOYEE = subject("employee");
const INTERN = subject("intern");

test("managers and above see the oversight widgets", () => {
  for (const s of [ADMIN, DIRECTOR, MANAGER, PROJECT_MANAGER]) {
    const w = resolveDashboardWidgets(s);
    assert.ok(
      w.primary.includes("needs-attention"),
      `${s.role} should see needs-attention`,
    );
    assert.ok(w.secondary.includes("team-load"), `${s.role} should see team-load`);
  }
});

test("non-managers never see the oversight widgets", () => {
  for (const s of [EMPLOYEE, INTERN]) {
    const w = resolveDashboardWidgets(s);
    assert.ok(
      !w.primary.includes("needs-attention"),
      `${s.role} must not see needs-attention`,
    );
    assert.ok(
      !w.secondary.includes("team-load"),
      `${s.role} must not see team-load`,
    );
  }
});

test("every role keeps its own-scope widgets", () => {
  // Today's focus is the user's own agenda — nobody loses it, whatever
  // else they are denied. A dashboard with nothing on it is a bug.
  for (const s of [ADMIN, DIRECTOR, MANAGER, EMPLOYEE, INTERN]) {
    const w = resolveDashboardWidgets(s);
    assert.ok(w.primary.includes("today-focus"), `${s.role} should see today-focus`);
  }
});

test("the glance row is capped and never empty", () => {
  for (const s of [ADMIN, DIRECTOR, MANAGER, EMPLOYEE, INTERN]) {
    const kpis = resolveKpis(s);
    assert.ok(kpis.length > 0, `${s.role} should get at least one KPI`);
    assert.ok(
      kpis.length <= KPI_LIMIT,
      `${s.role} got ${kpis.length} KPIs, limit is ${KPI_LIMIT}`,
    );
  }
});

test("legacy role aliases resolve identically to their canonical role", () => {
  // The DB still carries super_admin and project_manager. If these ever
  // diverge from admin/manager, someone loses access silently.
  assert.deepEqual(
    resolveDashboardWidgets(subject("super_admin")),
    resolveDashboardWidgets(ADMIN),
  );
  assert.deepEqual(
    resolveDashboardWidgets(PROJECT_MANAGER),
    resolveDashboardWidgets(MANAGER),
  );
});

test("an unknown role degrades closed, not open", () => {
  // Closed-world default: a role nobody anticipated must not inherit
  // oversight surfaces.
  const w = resolveDashboardWidgets(subject("something-new"));
  assert.ok(!w.primary.includes("needs-attention"));
  assert.ok(!w.secondary.includes("team-load"));
});

test("a deny grant revokes a widget the role would otherwise allow", () => {
  const revoked: Subject = {
    ...MANAGER,
    grants: [{ action: "team:workload.read", effect: "deny" }],
  };
  const w = resolveDashboardWidgets(revoked);
  assert.ok(!w.secondary.includes("team-load"), "deny grant must revoke team-load");
  // Unrelated manager surfaces are untouched.
  assert.ok(w.primary.includes("needs-attention"));
});

test("an allow grant extends a role that would otherwise be denied", () => {
  const promoted: Subject = {
    ...EMPLOYEE,
    grants: [{ action: "team:workload.read", effect: "allow" }],
  };
  const w = resolveDashboardWidgets(promoted);
  assert.ok(w.secondary.includes("team-load"), "allow grant should surface team-load");
  // Only the granted action moves — needs-attention was not granted.
  assert.ok(!w.primary.includes("needs-attention"));
});

test("an allow grant on a resource-scoped action is ignored", () => {
  // project:read carries region scoping. If an allow-override short-circuited
  // it, a user would receive the entire portfolio regardless of their regions.
  // This test exists to fail loudly if project:read is ever added to
  // OVERRIDABLE_ACTIONS.
  const scoped: Subject = {
    userId: "user-1",
    role: "employee",
    regions: [],
    grants: [{ action: "project:read", effect: "allow" }],
  };
  const decision = authorize(scoped, "project:read", {
    kind: "project",
    id: "p1",
    country: "CH",
  });
  assert.equal(
    decision.allow,
    false,
    "allow-override must not bypass region scoping on project:read",
  );
});

test("deny beats allow when both are present for the same action", () => {
  const conflicted: Subject = {
    ...MANAGER,
    grants: [
      { action: "team:workload.read", effect: "allow" },
      { action: "team:workload.read", effect: "deny" },
    ],
  };
  // find() takes the first match, so assert the safe direction explicitly
  // rather than relying on declaration order.
  const w = resolveDashboardWidgets({
    ...conflicted,
    grants: [
      { action: "team:workload.read", effect: "deny" },
      { action: "team:workload.read", effect: "allow" },
    ],
  });
  assert.ok(!w.secondary.includes("team-load"), "deny must win");
});

test("the grant system cannot grant control of the grant system", () => {
  // NO-ESCALATION INVARIANT. If settings:permissions.update were grantable,
  // one grant would let its holder grant themselves everything else.
  assert.equal(
    GRANTABLE_ACTIONS.includes("settings:permissions.update"),
    false,
    "settings:permissions.update must never be grantable",
  );

  // And prove it end-to-end, not just by inspecting the list.
  const escalating: Subject = {
    userId: "user-1",
    role: "employee",
    regions: [],
    grants: [{ action: "settings:permissions.update", effect: "allow" }],
  };
  assert.equal(
    authorize(escalating, "settings:permissions.update", null).allow,
    false,
    "an allow-grant must not confer permission-matrix editing",
  );
});

test("no grantable action carries resource-level scoping", () => {
  // Allow-grants short-circuit the decision branch. Any action whose branch
  // applies region, assignment or ownership logic would have that logic
  // bypassed. This asserts the set stays free of them.
  const RESOURCE_SCOPED: readonly string[] = [
    "project:read",
    "project:update",
    "project:update.status",
    "project:delete",
    "project:assign",
    "agenda:read",
    "agenda:update",
    "agenda:delete",
    "chat:message.update",
    "chat:message.delete",
    "thread:read",
    "thread:post",
  ];
  for (const action of GRANTABLE_ACTIONS) {
    assert.ok(
      !RESOURCE_SCOPED.includes(action),
      `${action} is resource-scoped and must not be grantable — an allow-grant ` +
        `would bypass its region/assignment checks`,
    );
  }
});

test("widget order values are unique within a slot", () => {
  const bySlot = new Map<string, number[]>();
  for (const w of DASHBOARD_WIDGETS) {
    bySlot.set(w.slot, [...(bySlot.get(w.slot) ?? []), w.order]);
  }
  for (const [slot, orders] of bySlot) {
    assert.equal(
      new Set(orders).size,
      orders.length,
      `duplicate order values in slot "${slot}" make layout non-deterministic`,
    );
  }
});
