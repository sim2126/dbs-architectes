import assert from "node:assert/strict";
import test from "node:test";
import type { ProjectResource, Subject } from "@/platform/authz/authorize";
import { canReadNotification, notificationChannelId, replyRecipient } from "./access";

const staff: Subject = { userId: "u1", role: "employee", isExternal: false, regions: [
  { country: "Switzerland", operatingRegion: "Valais", accessLevel: "view" },
] };
const project: ProjectResource = { kind: "project", id: "p1", country: "Switzerland", operatingRegion: "Valais", assignmentRole: "editor" };
const source = { projectId: "p1", href: "/dashboard/chat?channel=c1" };
const channel = { type: "project", projectId: "p1", isMember: true, isProjectAssignee: true };

test("removed assignees receive neither old nor new thread excerpts despite stale memberships", () => {
  assert.equal(canReadNotification(staff, source, project, channel), true);
  assert.equal(canReadNotification(staff, source, project, { ...channel, isProjectAssignee: false }), false);
  assert.deepEqual(replyRecipient("former-author", new Set(["u1"]), new Set()), []);
  assert.deepEqual(replyRecipient("u1", new Set(["u1"]), new Set()), ["u1"]);
  assert.deepEqual(replyRecipient("u1", new Set(["u1"]), new Set(["u1"])), []);
});

test("revoked chat or project read and withdrawn region grants suppress excerpts", () => {
  for (const action of ["chat:read", "project:read"] as const) {
    assert.equal(canReadNotification({ ...staff, grants: [{ action, effect: "deny" }] }, source, project, channel), false);
  }
  assert.equal(canReadNotification(staff, source, { ...project, operatingRegion: "Ticino" }, channel), false);
  assert.equal(canReadNotification(staff, { projectId: "p1" }, null, null), false);
  assert.equal(canReadNotification(staff, source, project, null), false);
});

test("external users retain only explicitly invited conversations, never project status excerpts", () => {
  const guest = { ...staff, isExternal: true };
  assert.equal(canReadNotification(guest, source, project, { ...channel, isProjectAssignee: false }), true);
  assert.equal(canReadNotification(guest, source, project, { ...channel, isMember: false }), false);
  assert.equal(canReadNotification(guest, { projectId: "p1" }, project, null), false);
});

test("non-project channel membership and public staff access follow canonical channel rules", () => {
  const direct = { type: "direct", projectId: null, isMember: true, isProjectAssignee: false };
  assert.equal(canReadNotification(staff, { href: source.href }, null, direct), true);
  assert.equal(canReadNotification(staff, { href: source.href }, null, { ...direct, isMember: false }), false);
  assert.equal(canReadNotification(staff, { href: source.href }, null, { ...direct, type: "public", isMember: false }), true);
  assert.equal(notificationChannelId({ href: "/dashboard/chat?channel=a%2Fb" }), "a/b");
  assert.equal(notificationChannelId({ href: "/dashboard/projects?code=p1" }), null);
  assert.equal(canReadNotification(staff, {}, null, null), true);
});
