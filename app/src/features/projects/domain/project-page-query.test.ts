import assert from "node:assert/strict";
import test from "node:test";
import { parseProjectPageQuery, projectMatchesPageQuery } from "./project-page-query";

const assignedProject = {
  code: "DBS-2026-001",
  phase: "ETUDE/AP",
  workStatus: "doing",
  assignments: [{ userId: "user-1" }],
};

test("parses supported dashboard project filters and ignores unknown values", () => {
  assert.deepEqual(parseProjectPageQuery({ status: "STUCK", scope: "mine" }), {
    status: "stuck",
    scope: "mine",
  });
  assert.deepEqual(parseProjectPageQuery({ status: "delayed", scope: "team" }), {});
});

test("scope=mine only includes projects assigned to the current user", () => {
  assert.equal(projectMatchesPageQuery(assignedProject, { scope: "mine" }, "user-1"), true);
  assert.equal(projectMatchesPageQuery(assignedProject, { scope: "mine" }, "user-2"), false);
});

test("status=stuck matches the dashboard's work-status or stuck-phase definition", () => {
  assert.equal(
    projectMatchesPageQuery(
      { ...assignedProject, phase: "STUCK", workStatus: "doing" },
      { status: "stuck" },
      "user-1",
    ),
    true,
  );
  assert.equal(
    projectMatchesPageQuery(
      { ...assignedProject, phase: "ETUDE/AP", workStatus: "stuck" },
      { status: "stuck" },
      "user-1",
    ),
    true,
  );
  assert.equal(projectMatchesPageQuery(assignedProject, { status: "stuck" }, "user-1"), false);
});

test("code selects one project and is case-insensitive", () => {
  // DBS AI names projects by code, and the link out of an answer carries that
  // code. Without this the link resolved to the unfiltered list, so an answer
  // saying "DBS-2026-001 is stuck" led to all 24 projects.
  assert.deepEqual(parseProjectPageQuery({ code: " dbs-2026-001 " }), {
    code: "DBS-2026-001",
  });
  assert.equal(
    projectMatchesPageQuery(assignedProject, { code: "DBS-2026-001" }, "user-1"),
    true,
  );
  assert.equal(
    projectMatchesPageQuery(assignedProject, { code: "DBS-2026-999" }, "user-1"),
    false,
  );
});

test("code combines with status rather than replacing it", () => {
  // A link from an answer about stuck projects should not widen to a project
  // that merely shares the code filter.
  assert.equal(
    projectMatchesPageQuery(
      assignedProject,
      { code: "DBS-2026-001", status: "stuck" },
      "user-1",
    ),
    false,
  );
  assert.equal(
    projectMatchesPageQuery(
      { ...assignedProject, workStatus: "stuck" },
      { code: "DBS-2026-001", status: "stuck" },
      "user-1",
    ),
    true,
  );
});

test("an absent code does not filter anything out", () => {
  assert.equal(projectMatchesPageQuery(assignedProject, {}, "user-1"), true);
});
