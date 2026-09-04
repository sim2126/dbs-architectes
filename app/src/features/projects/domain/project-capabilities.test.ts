import assert from "node:assert/strict";
import test from "node:test";
import type { Subject } from "@/platform/authz";
import { projectCapabilities } from "./project-capabilities";

function subject(role: string, regions: Subject["regions"] = [{ country: "CH", accessLevel: "manage" }]): Subject {
  return { userId: "u1", role, isExternal: false, regions };
}

const SWISS = { id: "p1", country: "CH", assignments: [] as { userId: string; role?: string | null }[] };
const ITALIAN = { id: "p2", country: "IT", assignments: [] as { userId: string; role?: string | null }[] };

test("a director may do everything, in any country", () => {
  const caps = projectCapabilities(subject("director", []), ITALIAN);
  assert.deepEqual(caps, { read: true, update: true, updateStatus: true, assign: true });
});

test("a manager may update and set status, but not assign", () => {
  const caps = projectCapabilities(subject("manager"), SWISS);
  assert.equal(caps.update, true);
  assert.equal(caps.updateStatus, true);
  assert.equal(caps.assign, false, "assigning is for directors and project leads");
});

test("an unassigned employee may read only", () => {
  const caps = projectCapabilities(subject("employee"), SWISS);
  assert.deepEqual(caps, { read: true, update: false, updateStatus: false, assign: false });
});

test("an assigned employee may set status but not other fields", () => {
  const caps = projectCapabilities(subject("employee"), {
    ...SWISS,
    assignments: [{ userId: "u1", role: "reviewer" }],
  });
  assert.equal(caps.updateStatus, true);
  assert.equal(caps.update, false);
});

test("an editor on the project may update its fields", () => {
  const caps = projectCapabilities(subject("employee"), {
    ...SWISS,
    assignments: [{ userId: "u1", role: "editor" }],
  });
  assert.equal(caps.update, true);
  assert.equal(caps.assign, false);
});

test("a lead on the project may assign", () => {
  const caps = projectCapabilities(subject("employee"), {
    ...SWISS,
    assignments: [{ userId: "u1", role: "lead" }],
  });
  assert.equal(caps.assign, true);
  assert.equal(caps.update, true);
});

test("someone else's assignment grants nothing", () => {
  const caps = projectCapabilities(subject("employee"), {
    ...SWISS,
    assignments: [{ userId: "someone-else", role: "lead" }],
  });
  assert.deepEqual(caps, { read: true, update: false, updateStatus: false, assign: false });
});

test("a project outside the caller's regions is not readable or editable", () => {
  const caps = projectCapabilities(subject("manager"), ITALIAN);
  assert.equal(caps.read, false);
  assert.equal(caps.update, false);
  // Status is deliberately region-free in policy: a manager may unstick a
  // project anywhere. Recorded here so a change to that rule is deliberate.
  assert.equal(caps.updateStatus, true);
});

test("a project with no country is firm-wide", () => {
  const caps = projectCapabilities(subject("manager"), { ...SWISS, country: null });
  assert.equal(caps.read, true);
  assert.equal(caps.update, true);
});
