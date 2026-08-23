import assert from "node:assert/strict";
import test from "node:test";
import { canReadChannel, type ChannelAccessFacts } from "./channel-access";

const PUBLIC: ChannelAccessFacts = {
  type: "public",
  projectId: null,
  isMember: false,
  isProjectAssignee: false,
};

const STAFF = { userId: "staff-1", isExternal: false };
const GUEST = { userId: "guest-1", isExternal: true };

test("staff can read workspace public channels", () => {
  assert.equal(canReadChannel(STAFF, PUBLIC), true);
});

test("private and direct channels require membership", () => {
  assert.equal(canReadChannel(STAFF, { ...PUBLIC, type: "direct" }), false);
  assert.equal(
    canReadChannel(STAFF, { ...PUBLIC, type: "direct", isMember: true }),
    true,
  );
});

test("a live project assignment grants staff access", () => {
  const project = { ...PUBLIC, type: "project", projectId: "project-1" };
  assert.equal(canReadChannel(STAFF, project), false);
  assert.equal(canReadChannel(STAFF, { ...project, isProjectAssignee: true }), true);
});

test("stale channel membership does not survive project assignment removal", () => {
  const removedAssignee = {
    ...PUBLIC,
    type: "project",
    projectId: "project-1",
    isMember: true,
    isProjectAssignee: false,
  };
  assert.equal(canReadChannel(STAFF, removedAssignee), false);
});

test("guests require explicit membership even for public and project channels", () => {
  assert.equal(canReadChannel(GUEST, PUBLIC), false);
  assert.equal(
    canReadChannel(GUEST, { ...PUBLIC, isProjectAssignee: true }),
    false,
  );
  assert.equal(canReadChannel(GUEST, { ...PUBLIC, isMember: true }), true);
  assert.equal(
    canReadChannel(GUEST, {
      ...PUBLIC,
      type: "project",
      projectId: "project-1",
      isMember: true,
    }),
    true,
  );
});
