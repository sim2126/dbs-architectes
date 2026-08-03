import assert from "node:assert/strict";
import test from "node:test";
import { AGENT_RESPONSE_SCHEMA, parseAgentResponse } from "./blocks";

test("agent responses require the grounding-reference envelope", () => {
  const response = {
    blocks: [{ type: "prose", text: "Le Saillen is on track." }],
    userIds: [],
    projectIds: ["project-saillen"],
    phases: [],
    dates: [],
  };

  assert.deepEqual(parseAgentResponse(JSON.stringify(response)), response);
  assert.equal(parseAgentResponse(JSON.stringify({ blocks: response.blocks })), null);
  assert.deepEqual(AGENT_RESPONSE_SCHEMA.required, [
    "blocks",
    "userIds",
    "projectIds",
    "phases",
    "dates",
  ]);
});

test("agent responses reject invalid nested blocks and extra properties", () => {
  const envelope = {
    userIds: [],
    projectIds: [],
    phases: [],
    dates: [],
  };

  assert.equal(parseAgentResponse(JSON.stringify({
    ...envelope,
    blocks: [{ type: "project_list", projects: [{ code: "DBS-1" }] }],
  })), null);
  assert.equal(parseAgentResponse(JSON.stringify({
    ...envelope,
    blocks: [{ type: "agenda", items: [{
      title: "Review",
      date: "2026-08-04",
      priority: "urgent",
      status: "pending",
    }] }],
  })), null);
  assert.equal(parseAgentResponse(JSON.stringify({
    ...envelope,
    blocks: [{ type: "prose", text: "Grounded", unexpected: true }],
  })), null);
});
