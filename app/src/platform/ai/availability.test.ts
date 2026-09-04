import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { aiProviderConfigured } from "./availability";

test("provider availability follows the key, and whitespace is not a key", () => {
  const saved = process.env.OPENAI_API_KEY;
  try {
    delete process.env.OPENAI_API_KEY;
    assert.equal(aiProviderConfigured(), false);
    process.env.OPENAI_API_KEY = "   ";
    assert.equal(aiProviderConfigured(), false);
    process.env.OPENAI_API_KEY = "sk-test";
    assert.equal(aiProviderConfigured(), true);
  } finally {
    if (saved === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = saved;
  }
});

test("the agent route decides availability before it spends quota", () => {
  // Order matters: an unavailable provider must cost the caller nothing. The
  // first run of the concurrency suite on a keyless staging box charged twenty
  // quota slots for twenty 500s because this check lived after the quota.
  const src = readFileSync(new URL("../../app/api/agent/route.ts", import.meta.url), "utf8");
  const guardAt = src.indexOf("if (!aiProviderConfigured()) return aiUnavailableResponse();");
  const quotaAt = src.indexOf("consumeAiRequestQuota(access.subject.userId)");
  assert.ok(guardAt > 0, "availability guard is missing from the agent route");
  assert.ok(guardAt < quotaAt, "availability must be decided before quota is consumed");
});

test("every early exit between quota and lease refunds the slot", () => {
  // Structural: between the line that consumes quota and the line that takes
  // the lease, each `return` must be immediately preceded by a refund. This is
  // the leak that a throughput test never sees — a request refused for a good
  // reason still charged the caller — and it has already been reintroduced
  // once by adding an early return without thinking about the slot.
  const src = readFileSync(new URL("../../app/api/agent/route.ts", import.meta.url), "utf8");
  const start = src.indexOf("const chatSessionId = body.sessionId;");
  const end = src.indexOf("lease = await acquireAiAgentLease(");
  assert.ok(start > 0 && end > start, "route structure changed; update this test deliberately");
  const lines = src.slice(start, end).split("\n");
  const offenders: string[] = [];
  lines.forEach((line, i) => {
    if (/^\s*return (Response\.json\(|rateLimitedResponse\(|new Response\()/.test(line)) {
      const before = lines.slice(Math.max(0, i - 3), i).join("\n");
      if (!before.includes("refundAiRequestQuota(requestLimit.eventId)")) offenders.push(line.trim());
    }
  });
  assert.deepEqual(offenders, [], `early exits without a quota refund:\n  ${offenders.join("\n  ")}`);
});
