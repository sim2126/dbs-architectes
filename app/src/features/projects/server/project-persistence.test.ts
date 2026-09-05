import assert from "node:assert/strict";
import { afterEach, before, mock, test } from "node:test";
import { Prisma, type PrismaClient } from "@prisma/client";
import type { Subject } from "@/platform/authz/authorize";
import { ProjectInputError } from "../domain/project-input";

const unexpected = async () => { throw new Error("Unexpected database call in unit test"); };
const prisma = {
  project: { findMany: unexpected, create: unexpected, update: unexpected },
  activity: { create: unexpected },
  $transaction: unexpected, $executeRaw: unexpected, $queryRaw: unexpected,
} as unknown as PrismaClient;
let listProjects: typeof import("./list-projects").listProjects;
let createProject: typeof import("./create-project").createProject;
let updateProject: typeof import("./update-project").updateProject;
before(async () => {
  (globalThis as unknown as { prisma: PrismaClient }).prisma = prisma;
  ({ listProjects } = await import("./list-projects"));
  ({ createProject } = await import("./create-project"));
  ({ updateProject } = await import("./update-project"));
});

afterEach(() => mock.restoreAll());
const subject: Subject = { userId: "u1", role: "manager", isExternal: false, regions: [{ country: "CH", operatingRegion: "Valais", accessLevel: "manage" }] };

test("project pagination uses immutable ID boundaries and includes the complete read scope", async () => {
  const rows = ["p1", "p2", "p3"].map((id) => ({ id, channels: [], assignments: [] }));
  const find = mock.method(prisma.project, "findMany", async () => rows);
  const result = await listProjects({ subject, limit: 2, cursor: "p0" });
  assert.deepEqual(result.projects.map((project) => project.id), ["p1", "p2"]);
  assert.equal(result.nextCursor, "p2");
  assert.equal(result.hasMore, true);
  const query = find.mock.calls[0].arguments[0];
  assert.ok(query);
  assert.deepEqual(query.orderBy, { id: "asc" });
  assert.equal(query.cursor, undefined, "deleted cursor rows must not invalidate the boundary");
  const clauses = query.where?.AND;
  assert.ok(Array.isArray(clauses));
  assert.ok(clauses.some((clause) => JSON.stringify(clause) === JSON.stringify({ id: { gt: "p0" } })));
  assert.ok(clauses.some((clause) => JSON.stringify(clause).includes('"operatingRegion":"Valais"')));
});

test("a revoked project read permission reaches the database as an empty scope", async () => {
  const find = mock.method(prisma.project, "findMany", async () => []);
  const result = await listProjects({ subject: { ...subject, grants: [{ action: "project:read", effect: "deny" }] }, limit: 2 });
  assert.deepEqual(result, { projects: [], hasMore: false, nextCursor: null });
  const clauses = find.mock.calls[0].arguments[0]?.where?.AND;
  assert.ok(Array.isArray(clauses));
  assert.ok(clauses.some((clause) => JSON.stringify(clause) === '{"id":{"in":[]}}'));
});

function mockTransaction() {
  mock.method(prisma, "$transaction", async (operation: (tx: typeof prisma) => Promise<unknown>) => operation(prisma));
  mock.method(prisma.activity, "create", async () => ({}));
}

test("creation locks before allocating and persists the chosen status with its audit row", async () => {
  mockTransaction();
  const events: string[] = [];
  mock.method(prisma, "$executeRaw", async (sql: Prisma.Sql) => {
    assert.match(sql.text, /pg_advisory_xact_lock/);
    events.push("lock");
    return 1;
  });
  mock.method(prisma.project, "findMany", async () => { events.push("allocate"); return []; });
  mock.method(prisma.project, "create", async (args: { data: Prisma.ProjectCreateInput }) => {
    events.push("insert");
    return { id: "new-project", ...args.data, assignments: [] };
  });
  const created = await createProject({ actorUserId: subject.userId, data: { title: "Test project", workStatus: "stuck" } });
  assert.deepEqual(events, ["lock", "allocate", "insert"]);
  assert.equal(created.workStatus, "stuck");
  assert.match(created.code, /^DBS-\d{4}-001$/);
  assert.deepEqual(created.assignments, []);
});

test("manual code collisions produce a legible conflict instead of a server error", async () => {
  mockTransaction();
  mock.method(prisma, "$executeRaw", async () => 1);
  mock.method(prisma.project, "create", async () => {
    throw new Prisma.PrismaClientKnownRequestError("unique constraint", { code: "P2002", clientVersion: "test" });
  });
  await assert.rejects(createProject({ actorUserId: "u1", data: { title: "Test project", code: "EXISTING" } }),
    (error: unknown) => error instanceof ProjectInputError && error.status === 409);
});

test("a date-only edit checks the other endpoint under a row lock before any write", async () => {
  mockTransaction();
  const locks = mock.method(prisma, "$queryRaw", async (sql: Prisma.Sql) => {
    assert.match(sql.text, /FOR UPDATE/);
    return [{ startDate: new Date("2026-05-01"), endDate: new Date("2026-05-10") }];
  });
  const update = mock.method(prisma.project, "update", async () => ({ id: "p1", title: "Test project" }));
  await assert.rejects(updateProject({ actorUserId: "u1", projectId: "p1", data: { startDate: "2026-05-11" } }), /Start date must be/);
  assert.equal(locks.mock.callCount(), 1);
  assert.equal(update.mock.callCount(), 0);
});

test("valid year and cleared dates reach Prisma with their correct types", async () => {
  mockTransaction();
  mock.method(prisma, "$queryRaw", async () => [{ startDate: new Date("2026-05-01"), endDate: new Date("2026-05-10") }]);
  const update = mock.method(prisma.project, "update", async () => ({ id: "p1", title: "Test project" }));
  await updateProject({ actorUserId: "u1", projectId: "p1", data: { year: "2027", startDate: null } });
  assert.deepEqual(update.mock.calls[0].arguments[0]?.data, { year: 2027, startDate: null });
});

test("malformed dates fail before starting a database transaction", async () => {
  const tx = mock.method(prisma, "$transaction", async () => { throw new Error("must not query"); });
  await assert.rejects(updateProject({ actorUserId: "u1", projectId: "p1", data: { startDate: "2026-02-31" } }), ProjectInputError);
  await assert.rejects(createProject({ actorUserId: "u1", data: { title: "Test project", endDate: "2026-02-31" } }), ProjectInputError);
  assert.equal(tx.mock.callCount(), 0);
});
