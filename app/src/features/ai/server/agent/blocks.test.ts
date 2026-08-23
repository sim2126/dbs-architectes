import assert from "node:assert/strict";
import test from "node:test";
import {
  AGENT_RESPONSE_SCHEMA,
  blocksToPlainText,
  parseAgentResponse,
} from "./blocks";

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

const envelope = (blocks: unknown[]) => ({
  blocks,
  userIds: [],
  projectIds: [],
  phases: [],
  dates: [],
});

test("bar_chart round-trips and rejects a negative bar", () => {
  const ok = envelope([
    {
      type: "bar_chart",
      caption: "Active projects per person",
      bars: [
        { label: "Elena Moretti", value: 7, tone: "danger" },
        { label: "Denis Favre", value: 4, tone: null },
      ],
    },
  ]);
  assert.deepEqual(parseAgentResponse(JSON.stringify(ok)), ok);

  // A negative value would render as an inverted bar. The number comes from a
  // model, so it is rejected at the boundary rather than clamped downstream.
  const negative = envelope([
    { type: "bar_chart", caption: null, bars: [{ label: "x", value: -1 }] },
  ]);
  assert.equal(parseAgentResponse(JSON.stringify(negative)), null);

  // Unknown keys are refused like every other block.
  const extra = envelope([
    {
      type: "bar_chart",
      caption: null,
      bars: [{ label: "x", value: 1, colour: "red" }],
    },
  ]);
  assert.equal(parseAgentResponse(JSON.stringify(extra)), null);
});

test("every block variant lists all its properties as required", () => {
  // OpenAI strict mode demands that `required` name every key in
  // `properties`, including nullable ones. Getting this wrong does not fail
  // locally — the provider rejects the schema at request time, so the whole
  // assistant stops working. Checked structurally for all variants rather
  // than just the one added most recently.
  const variants = AGENT_RESPONSE_SCHEMA.properties.blocks.items
    .anyOf as ReadonlyArray<{
    readonly required: readonly string[];
    readonly properties: Readonly<Record<string, unknown>>;
  }>;
  assert.ok(variants.length >= 8, "expected every block variant present");
  for (const variant of variants) {
    assert.deepEqual(
      [...variant.required].sort(),
      Object.keys(variant.properties).sort(),
      `variant ${JSON.stringify(variant.properties.type)} has a required/properties mismatch`,
    );
  }
});

test("a bar chart survives being reduced to plain text", () => {
  // The plain-text form is what gets persisted and what a degraded surface
  // shows, so losing the bars must not lose the numbers.
  const text = blocksToPlainText([
    {
      type: "bar_chart",
      caption: "Projects per person",
      bars: [{ label: "Elena", value: 7 }, { label: "Denis", value: 4 }],
    },
  ]);
  assert.match(text, /Projects per person/);
  assert.match(text, /Elena: 7/);
  assert.match(text, /Denis: 4/);
});
