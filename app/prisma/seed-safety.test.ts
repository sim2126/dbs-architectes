import assert from "node:assert/strict";
import test from "node:test";
import {
  assertSafeDemoSeedTarget,
  DEMO_SEED_CONFIRMATION,
} from "./seed-safety";

const target = "localhost:5432/friday_demo?schema=public";
const safeEnvironment = {
  DATABASE_URL: "postgresql://friday:secret@localhost:5432/friday_demo",
  FRIDAY_DEMO_SEED_ALLOW: DEMO_SEED_CONFIRMATION,
  FRIDAY_DEMO_SEED_TARGET: target,
};

test("accepts an explicitly confirmed non-production database", () => {
  assert.deepEqual(assertSafeDemoSeedTarget(safeEnvironment), {
    connectionString: safeEnvironment.DATABASE_URL,
    identifier: target,
  });
});

test("refuses production even when the target is explicitly confirmed", () => {
  assert.throws(
    () => assertSafeDemoSeedTarget({ ...safeEnvironment, NODE_ENV: "production" }),
    /disabled in production/,
  );
});

test("requires the destructive-operation acknowledgement", () => {
  assert.throws(
    () =>
      assertSafeDemoSeedTarget({
        ...safeEnvironment,
        FRIDAY_DEMO_SEED_ALLOW: undefined,
      }),
    /FRIDAY_DEMO_SEED_ALLOW/,
  );
});

test("requires confirmation of the exact host and database", () => {
  assert.throws(
    () =>
      assertSafeDemoSeedTarget({
        ...safeEnvironment,
        FRIDAY_DEMO_SEED_TARGET: "localhost:5432/another_database?schema=public",
      }),
    /FRIDAY_DEMO_SEED_TARGET=localhost:5432\/friday_demo\?schema=public/,
  );
});

test("requires confirmation of the effective PostgreSQL schema", () => {
  assert.throws(
    () =>
      assertSafeDemoSeedTarget({
        ...safeEnvironment,
        DATABASE_URL:
          "postgresql://friday:secret@localhost:5432/friday_demo?schema=production",
      }),
    /schema=production/,
  );
});

test("rejects non-PostgreSQL connection URLs", () => {
  assert.throws(
    () =>
      assertSafeDemoSeedTarget({
        ...safeEnvironment,
        DATABASE_URL: "file:./demo.db",
      }),
    /only supports PostgreSQL/,
  );
});
