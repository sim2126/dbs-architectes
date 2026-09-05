import assert from "node:assert/strict";
import test from "node:test";
import { acceptanceTarget } from "./acceptance-target.mjs";

const local = {
  DATABASE_URL: "postgresql://fixture:private-password@127.0.0.1:55433/friday_review?schema=public",
  FRIDAY_LOAD_TARGET: "127.0.0.1:55433/friday_review?schema=public",
};

test("attestation identifies the configured disposable DB without credentials", () => {
  assert.equal(acceptanceTarget(local), local.FRIDAY_LOAD_TARGET);
  assert.ok(!acceptanceTarget(local)!.includes("private-password"));
  assert.equal(acceptanceTarget({ ...local, NODE_ENV: "production" }), local.FRIDAY_LOAD_TARGET,
    "the local acceptance server runs a production build");
});

test("ordinary, remote, mismatched and production servers expose no target", () => {
  for (const env of [
    {},
    { DATABASE_URL: local.DATABASE_URL },
    { ...local, FRIDAY_LOAD_TARGET: "127.0.0.1:5432/friday_review?schema=public" },
    { ...local, DATABASE_URL: "postgresql://fixture:private-password@remote.neon.tech/friday_review" },
    { ...local, DATABASE_URL: local.DATABASE_URL + "&host=remote.neon.tech" },
    { ...local, DATABASE_URL: "postgresql://fixture@127.0.0.1:55433/live" },
    { ...local, APP_ENV: "production" },
    { ...local, VERCEL_ENV: "production" },
    { ...local, FRIDAY_ENVIRONMENT: "PRODUCTION" },
  ]) assert.equal(acceptanceTarget(env), null);
});
