import assert from "node:assert/strict";
import test from "node:test";
import { surfaceForAgentRequest } from "./contracts";

for (const prompt of [
  "Project health report",
  "Portfolio statistics by phase",
  "Portfolio summary",
  "Breakdown by phase",
  "How many projects are active?",
  "What percentage of projects are stuck?",
  "Show blocked projects",
]) {
  test(`classifies project-health request: ${prompt}`, () => {
    assert.equal(surfaceForAgentRequest(prompt, true), "project-health");
    assert.equal(surfaceForAgentRequest(prompt, false), "project-health");
  });
}

test("preserves DBS AI and chat-agent defaults", () => {
  assert.equal(surfaceForAgentRequest("Show Le Saillen", true), "dbs-gpt");
  assert.equal(surfaceForAgentRequest("Show Le Saillen", false), "chat-agent");
});
