import assert from "node:assert/strict";
import test from "node:test";
import { Prisma } from "@prisma/client";
import { toggleReaction } from "../server/toggle-reaction";

const key = { messageId: "m1", userId: "u1", emoji: "thumbs-up" };

test("simultaneous removal of the same existing reaction is idempotent", async () => {
  const ids = new Set(["reaction-1"]);
  let reads = 0;
  let release!: () => void;
  const allRead = new Promise<void>((resolve) => { release = resolve; });
  const store = {
    findUnique: async () => { if (++reads === 10) release(); await allRead; return { id: "reaction-1" }; },
    deleteMany: async ({ where }: { where: { id: string } }) => ({ count: Number(ids.delete(where.id)) }),
    create: async () => { throw new Error("removal must not create a reaction"); },
  };
  const results = await Promise.all(Array.from({ length: 10 }, () => toggleReaction(store, key)));
  assert.deepEqual(results, Array(10).fill(false));
  assert.equal(ids.size, 0);
});

test("only duplicate creation is treated as success; other failures remain visible", async () => {
  const store = { findUnique: async () => null, deleteMany: async () => ({ count: 0 }), create: async () => {
    throw new Prisma.PrismaClientKnownRequestError("duplicate", { code: "P2002", clientVersion: "7" });
  } };
  assert.equal(await toggleReaction(store, key), true);
  await assert.rejects(toggleReaction({ ...store, create: async () => { throw new Error("offline"); } }, key), /offline/);
  let inserted = false;
  assert.equal(await toggleReaction({ ...store, create: async () => { inserted = true; } }, key), true);
  assert.equal(inserted, true);
});
