import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

test("DBS GPT cost and concurrency controls are shared across server instances", () => {
  const guard = readFileSync(
    join(process.cwd(), "src/platform/ai/request-guard.ts"),
    "utf8",
  );
  assert.match(guard, /pg_advisory_xact_lock/);
  assert.match(guard, /tx\.aiRequestEvent\.create/);
  assert.match(guard, /tx\.aiAgentLease\.upsert/);

  const route = readFileSync(
    join(process.cwd(), "src/app/api/agent/route.ts"),
    "utf8",
  );
  assert.match(route, /await consumeAiRequestQuota/);
  assert.match(route, /await acquireAiAgentLease/);
  assert.match(route, /await releaseAiAgentLease/);
  assert.doesNotMatch(route, /activeAgentUsers/);
});
