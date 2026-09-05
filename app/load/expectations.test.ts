import assert from "node:assert/strict";
import test from "node:test";
import { authorize } from "../src/platform/authz/authorize";
import { accountFor, sessionFor, expectsThreadAccess, expectedReadStatus, expectedWriteStatus } from "./k6/lib/expectations.mjs";

test("role expectations survive setup serialisation to each virtual user", () => {
  for (const role of ["owner", "admin", "director", "manager", "pm", "employee", "partner", "intern"]) {
    const session = JSON.parse(JSON.stringify(sessionFor(accountFor(role), "cookie", role)));
    assert.equal(session.managerPlus, ["owner", "admin", "director", "manager", "pm"].includes(role));
    assert.equal(session.directorPlus, ["owner", "admin", "director"].includes(role));
    assert.equal(session.canPost, role !== "intern");
    assert.equal(expectsThreadAccess(session, { assignments: [] }), false);
    assert.equal(expectsThreadAccess(session, { assignments: [{ userId: role }] }), true);
    assert.equal("password" in session, false);
  }
});

test("load thread expectations match canonical assignment policy even for directors", () => {
  for (const role of ["owner", "admin", "director", "manager", "pm", "employee", "partner", "intern"]) {
    const session = sessionFor(accountFor(role), "cookie", role);
    const fixtureRoles: Record<string, string> = { owner: "super_admin", pm: "project_manager", partner: "collaborator" };
    const subject = { userId: role, role: fixtureRoles[role] ?? role, isExternal: false, regions: [] };
    assert.equal(session.canPost, authorize(subject, "chat:post", null).allow);
    for (const assigned of [true, false]) {
      const expected = authorize(subject, "thread:read", { kind: "project", id: "visible", country: null, assignmentRole: assigned ? "viewer" : null });
      assert.equal(expectsThreadAccess(session, { assignments: assigned ? [{ userId: role }] : [] }), expected.allow);
    }
  }
});

test("denial checks reject accidental permission widening as well as unexpected refusals", () => {
  assert.equal(expectedReadStatus(200), true);
  assert.equal(expectedReadStatus(403), false);
  assert.equal(expectedReadStatus(403, true), true);
  assert.equal(expectedReadStatus(200, true), false);
  for (const status of [301, 401, 429, 500]) {
    assert.equal(expectedReadStatus(status), false);
    assert.equal(expectedReadStatus(status, true), false);
  }
});

test("chat writes accept the route's actual success response and throttling only", () => {
  for (const status of [200, 201, 429]) assert.equal(expectedWriteStatus(status), true);
  for (const status of [301, 400, 401, 403, 500]) assert.equal(expectedWriteStatus(status), false);
  assert.equal(expectedWriteStatus(403, true), true);
  for (const status of [200, 201, 429, 500]) assert.equal(expectedWriteStatus(status, true), false);
});
