import assert from "node:assert/strict";
import test from "node:test";
import { assertLocalBaseUrl, assertLocalDatabaseTarget, assertLoadTargetIdentifier, assertServerTarget } from "./target-safety.mjs";

test("load targets must be explicit loopback origins, without credential/path/redirect tricks", () => {
  for (const url of ["http://localhost:3100", "http://127.0.0.1:3000/", "http://[::1]:3100"]) {
    assert.equal(assertLocalBaseUrl(url), url.replace(/\/$/, ""));
  }
  for (const url of ["https://friday.vercel.app", "http://localhost.evil.test:3100", "http://localhost:3100@evil.test", "http://evil.test/@localhost:3100", "http://127.0.0.1:3100/path", "http://localhost:70000", "http://localhost:3100?host=evil.test", "http://localhost:3100\n"]) {
    assert.throws(() => assertLocalBaseUrl(url));
  }
});

test("a local HTTP server must attest the same disposable database before any test login", () => {
  const expected = "127.0.0.1:55433/friday_review?schema=public";
  assert.equal(assertLoadTargetIdentifier(expected), expected);
  assert.doesNotThrow(() => assertServerTarget({ target: expected }, expected));
  for (const body of [null, {}, { target: "localhost:5432/friday_ci?schema=public" }, { target: "remote.neon.tech:5432/friday_review?schema=public" }]) {
    assert.throws(() => assertServerTarget(body, expected));
  }
  for (const value of [undefined, "", `${expected}\n`, "localhost:70000/friday_review?schema=public", "localhost:5432/live?schema=public", `${expected}&host=remote.neon.tech`]) {
    assert.throws(() => assertLoadTargetIdentifier(value));
  }
});

test("destructive concurrency probes require the exact disposable local database", () => {
  const env = { DATABASE_URL: "postgresql://tester:secret@localhost:55433/friday_review?schema=public", FRIDAY_LOAD_TARGET: "localhost:55433/friday_review?schema=public" };
  assert.equal(assertLocalDatabaseTarget(env), env.DATABASE_URL);
  assert.throws(() => assertLocalDatabaseTarget({ ...env, FRIDAY_LOAD_TARGET: "" }));
  assert.throws(() => assertLocalDatabaseTarget({ ...env, APP_ENV: "production" }));
  for (const url of ["postgresql://tester@remote.neon.tech/friday_review", "postgresql://tester@localhost:55433/live", "postgresql://tester@evil.test/?x=@localhost:55433/friday_review", `${env.DATABASE_URL}&host=remote.neon.tech`, `${env.DATABASE_URL}&dbname=live`, "postgresql://tester@localhost:55433/friday_review?schema=customer"]) {
    assert.throws(() => assertLocalDatabaseTarget({ ...env, DATABASE_URL: url }));
  }
});
