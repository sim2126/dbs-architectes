import assert from "node:assert/strict";
import test from "node:test";
import {
  AiProviderFailure,
  buildAnthropicStructuredPolicy,
  buildOpenAIStructuredPolicy,
  clampFactualTemperature,
  classifyProviderError,
  createOpenAIStructuredCompletion,
  parseStructuredOutput,
} from "./provider";

const OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["answer"],
  properties: { answer: { type: "string" } },
} as const;

test("clamps factual extraction temperature to the zero-to-0.2 range", () => {
  assert.equal(clampFactualTemperature(-1), 0);
  assert.equal(clampFactualTemperature(0.1), 0.1);
  assert.equal(clampFactualTemperature(1), 0.2);
  assert.throws(() => clampFactualTemperature(Number.NaN), /finite number/);
});

test("builds a strict OpenAI JSON schema policy without changing the model", () => {
  const policy = buildOpenAIStructuredPolicy({
    model: "gpt-4.1-mini",
    temperature: 0.7,
    schemaName: "GroundedAnswer",
    schema: OUTPUT_SCHEMA,
  });

  assert.equal(policy.model, "gpt-4.1-mini");
  assert.equal(policy.temperature, 0.2);
  assert.deepEqual(policy.response_format, {
    type: "json_schema",
    json_schema: {
      name: "GroundedAnswer",
      strict: true,
      schema: OUTPUT_SCHEMA,
    },
  });
});

test("builds a forced Anthropic tool-use policy without adding a provider client", () => {
  const policy = buildAnthropicStructuredPolicy({
    model: "claude-sonnet-4",
    temperature: 0.1,
    toolName: "return_grounded_answer",
    toolDescription: "Return the grounded answer.",
    schema: OUTPUT_SCHEMA,
  });

  assert.equal(policy.model, "claude-sonnet-4");
  assert.equal(policy.temperature, 0.1);
  assert.deepEqual(policy.tool_choice, { type: "tool", name: "return_grounded_answer" });
  assert.deepEqual(policy.tools[0].input_schema, OUTPUT_SCHEMA);
});

test("the OpenAI client wrapper always applies the strict policy", async () => {
  let captured: Record<string, unknown> | undefined;
  const client = {
    chat: {
      completions: {
        async create(request: Record<string, unknown>) {
          captured = request;
          return { id: "completion-1", choices: [] };
        },
      },
    },
  };

  await createOpenAIStructuredCompletion(
    client as never,
    { messages: [{ role: "user", content: "Ground this" }] },
    {
      model: "gpt-4o-mini",
      temperature: 1,
      schemaName: "GroundedAnswer",
      schema: OUTPUT_SCHEMA,
    },
  );

  assert.equal(captured?.model, "gpt-4o-mini");
  assert.equal(captured?.temperature, 0.2);
  assert.deepEqual(captured?.response_format, {
    type: "json_schema",
    json_schema: { name: "GroundedAnswer", strict: true, schema: OUTPUT_SCHEMA },
  });
});

test("rejects JSON schemas that can silently accept extra fields", () => {
  assert.throws(
    () => buildOpenAIStructuredPolicy({
      model: "gpt-4o-mini",
      temperature: 0.1,
      schemaName: "Loose",
      schema: { type: "object", properties: { answer: { type: "string" } }, required: [] },
    }),
    /additionalProperties/,
  );
});

test("accepts validated JSON objects and rejects free text", () => {
  const parsed = parseStructuredOutput('{"answer":"Grounded"}', (value) => {
    if (typeof value.answer !== "string") throw new Error("answer is required");
    return { answer: value.answer };
  });
  assert.deepEqual(parsed, { answer: "Grounded" });

  assert.throws(
    () => parseStructuredOutput("unstructured answer", (value) => value),
    (error: unknown) => error instanceof AiProviderFailure && error.kind === "invalid_output",
  );
});

test("classifies rate limits, timeouts and provider 500s without leaking raw errors", () => {
  const rateLimit = classifyProviderError({ status: 429, message: "secret upstream detail" });
  const timeout = classifyProviderError(Object.assign(new Error("request timed out"), { code: "ETIMEDOUT" }));
  const unavailable = classifyProviderError({ response: { status: 503 }, message: "internal provider trace" });

  assert.equal(rateLimit.kind, "rate_limited");
  assert.equal(rateLimit.status, 429);
  assert.equal(timeout.kind, "timeout");
  assert.equal(unavailable.kind, "unavailable");
  assert.equal(unavailable.status, 503);
  assert.doesNotMatch(unavailable.message, /internal provider trace/);
});
