import assert from "node:assert/strict";
import test from "node:test";
import { parseProjectPageQuery, projectMatchesPageQuery } from "./project-page-query";

const assignedProject = {
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
