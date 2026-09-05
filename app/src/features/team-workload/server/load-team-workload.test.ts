import assert from "node:assert/strict";
import { afterEach, before, mock, test } from "node:test";
import type { PrismaClient } from "@prisma/client";
import type { Subject } from "@/platform/authz/authorize";
import { projectReadWhere } from "@/platform/authz/project-read-where";

const unexpected = async () => { throw new Error("Unexpected database call in unit test"); };
const prisma = {
  user: { findMany: unexpected }, projectAssignment: { findMany: unexpected },
  workItem: { findMany: unexpected }, projectStatusUpdate: { findMany: unexpected },
} as unknown as PrismaClient;
let loadTeamWorkload: typeof import("./load-team-workload").loadTeamWorkload;
before(async () => {
  (globalThis as unknown as { prisma: PrismaClient }).prisma = prisma;
  ({ loadTeamWorkload } = await import("./load-team-workload"));
});

afterEach(() => mock.restoreAll());
const subject: Subject = { userId: "u1", role: "manager", isExternal: false, regions: [{ country: "CH", operatingRegion: "Valais", accessLevel: "view" }] };

test("denied workload access fails before reading any employee metadata", async () => {
  const users = mock.method(prisma.user, "findMany", async () => []);
  await assert.rejects(loadTeamWorkload({ ...subject, grants: [{ action: "team:workload.read", effect: "deny" }] }), /revoked/);
  assert.equal(users.mock.callCount(), 0);
});

test("an explicit workload grant is honoured and every project relation is scoped", async () => {
  const allowed: Subject = { ...subject, role: "employee", grants: [{ action: "team:workload.read", effect: "allow" }] };
  mock.method(prisma.user, "findMany", async () => [{ id: "u1", name: "Test member", email: "test@example.invalid" }]);
  const assignments = mock.method(prisma.projectAssignment, "findMany", async () => []);
  const workItems = mock.method(prisma.workItem, "findMany", async () => []);
  const status = mock.method(prisma.projectStatusUpdate, "findMany", async () => []);
  const result = await loadTeamWorkload(allowed);
  assert.equal(result.members.length, 1);
  assert.deepEqual(assignments.mock.calls[0].arguments[0]?.where?.project, projectReadWhere(allowed));
  assert.deepEqual(status.mock.calls[0].arguments[0]?.where?.project, projectReadWhere(allowed));
  for (const call of workItems.mock.calls) {
    assert.ok(JSON.stringify(call.arguments[0]?.where).includes('"operatingRegion":"Valais"'));
  }
});
