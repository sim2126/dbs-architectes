import assert from "node:assert/strict";
import { afterEach, before, mock, test } from "node:test";
import type { Prisma, PrismaClient } from "@prisma/client";

const unexpected = async () => { throw new Error("Unexpected database call in unit test"); };
const prisma = {
  channelMember: { createMany: unexpected, findUniqueOrThrow: unexpected },
} as unknown as PrismaClient;
let addChannelMember: typeof import("../server/add-channel-member").addChannelMember;
before(async () => {
  (globalThis as unknown as { prisma: PrismaClient }).prisma = prisma;
  ({ addChannelMember } = await import("../server/add-channel-member"));
});
afterEach(() => mock.restoreAll());

test("concurrent admissions use the database conflict clause and return one membership", async () => {
  const rows = new Map<string, { id: string; channelId: string; userId: string; role: string }>();
  mock.method(prisma.channelMember, "createMany", async (args: Prisma.ChannelMemberCreateManyArgs) => {
    assert.equal(args.skipDuplicates, true);
    const data = Array.isArray(args.data) ? args.data[0] : args.data;
    const key = `${data.channelId}:${data.userId}`;
    if (rows.has(key)) return { count: 0 };
    rows.set(key, { id: "member-1", channelId: data.channelId, userId: data.userId, role: data.role ?? "member" });
    return { count: 1 };
  });
  mock.method(prisma.channelMember, "findUniqueOrThrow", async (args: Prisma.ChannelMemberFindUniqueOrThrowArgs) => {
    const key = args.where.channelId_userId;
    assert.ok(key);
    const row = rows.get(`${key.channelId}:${key.userId}`);
    assert.ok(row);
    return { ...row, user: { id: row.userId, name: "Guest", initials: "G", image: null, isExternal: true } };
  });
  const results = await Promise.all(Array.from({ length: 10 }, () => addChannelMember("c1", "u1")));
  assert.equal(rows.size, 1);
  assert.deepEqual(results.map((member) => member.id), Array(10).fill("member-1"));
  assert.equal(results[0].user.id, "u1");
  rows.set("c1:u1", { id: "member-1", channelId: "c1", userId: "u1", role: "admin" });
  assert.equal((await addChannelMember("c1", "u1")).role, "admin", "re-admission must preserve an existing role");
});

test("a failed admission remains an error instead of returning a fabricated membership", async () => {
  mock.method(prisma.channelMember, "createMany", async () => { throw new Error("database unavailable"); });
  await assert.rejects(addChannelMember("c1", "u1"), /database unavailable/);
});
