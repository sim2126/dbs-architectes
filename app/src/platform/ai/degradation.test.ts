import assert from "node:assert/strict";
import test from "node:test";
import type { AiSurface, ResolvedContext } from "./grounding";
import { generateSummary } from "@/platform/integrations/meeting-summarizer";
import { translateGroundedText } from "@/platform/integrations/translator";
import {
  createOpenAIStructuredCompletion,
  createOpenAIStructuredStream,
  toSafeAiFailure,
  type AiProviderFailureKind,
  type SafeAiFailure,
} from "./provider";

const OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["answer"],
  properties: { answer: { type: "string" } },
} as const;

const SURFACES = [
  "meeting-summary",
  "dbs-gpt",
  "chat-agent",
  "translation",
  "project-health",
] as const satisfies readonly AiSurface[];

const STREAMING_SURFACES = new Set<AiSurface>([
  "dbs-gpt",
  "chat-agent",
  "project-health",
]);

const GENERATED_SENTINEL = "UNVALIDATED_GENERATION_DBS-2099-999";
const GROUNDING_SENTINEL = "GROUNDING_CONTEXT_user-secret-project-secret";

interface FailureScenario {
  label: string;
  error: unknown;
  expectedKind: AiProviderFailureKind;
  expectedStatus: SafeAiFailure["httpStatus"];
  expectedMessage: string;
}

const scenarios: FailureScenario[] = [
  {
    label: "HTTP 500",
    error: {
      status: 500,
      message: `provider trace ${GENERATED_SENTINEL}`,
      partial_output: GENERATED_SENTINEL,
      resolved_context: GROUNDING_SENTINEL,
    },
    expectedKind: "unavailable",
    expectedStatus: 503,
    expectedMessage: "AI Assistant is temporarily unavailable. Please try again shortly.",
  },
  {
    label: "timeout",
    error: Object.assign(new Error(`request timed out ${GENERATED_SENTINEL}`), {
      code: "ETIMEDOUT",
      partial_output: GENERATED_SENTINEL,
      resolved_context: GROUNDING_SENTINEL,
    }),
    expectedKind: "timeout",
    expectedStatus: 503,
    expectedMessage: "AI Assistant did not receive a response in time. Please try again.",
  },
  {
    label: "rate limit",
    error: {
      response: { status: 429, data: GENERATED_SENTINEL },
      message: `quota detail ${GROUNDING_SENTINEL}`,
    },
    expectedKind: "rate_limited",
    expectedStatus: 429,
    expectedMessage: "AI Assistant is temporarily busy. Please try again shortly.",
  },
];

async function invokeFailingProvider(surface: AiSurface, providerError: unknown): Promise<unknown> {
  const client = {
    chat: {
      completions: {
        async create() {
          throw providerError;
        },
      },
    },
  };
  const request = { messages: [{ role: "user" as const, content: "Ground this request" }] };
  const policy = {
    model: "surface-model-unchanged",
    temperature: 0.2,
    schemaName: "GroundedAnswer",
    schema: OUTPUT_SCHEMA,
  };

  if (STREAMING_SURFACES.has(surface)) {
    return createOpenAIStructuredStream(client as never, request, policy);
  }
  return createOpenAIStructuredCompletion(client as never, request, policy);
}

for (const surface of SURFACES) {
  for (const scenario of scenarios) {
    test(`${surface} fails closed on ${scenario.label}`, async () => {
      let exposed: SafeAiFailure | undefined;

      await assert.rejects(
        () => invokeFailingProvider(surface, scenario.error),
        (error: unknown) => {
          exposed = toSafeAiFailure(surface, error);
          return true;
        },
      );

      assert.ok(exposed);
      assert.deepEqual(Object.keys(exposed), [
        "surface",
        "kind",
        "message",
        "httpStatus",
        "retryable",
      ]);
      assert.equal(exposed.surface, surface);
      assert.equal(exposed.kind, scenario.expectedKind);
      assert.equal(exposed.httpStatus, scenario.expectedStatus);
      assert.equal(exposed.message, scenario.expectedMessage);
      assert.equal(exposed.retryable, true);

      const serialised = JSON.stringify(exposed);
      assert.doesNotMatch(serialised, new RegExp(GENERATED_SENTINEL));
      assert.doesNotMatch(serialised, new RegExp(GROUNDING_SENTINEL));
      assert.equal("output" in exposed, false);
      assert.equal("resolvedContext" in exposed, false);
      assert.equal("cause" in exposed, false);
    });
  }
}

function resolvedContext(surface: AiSurface): ResolvedContext {
  return {
    surface,
    resolvedAt: "2026-08-03T12:00:00.000Z",
    users: [],
    projects: [],
    mentionedUserIds: [],
    mentionedProjectIds: [],
    phases: [],
    dates: [],
    recentMeetingDecisions: [],
    unresolved: [],
  };
}

function failingClient(providerError: unknown): OpenAIClientLike {
  return {
    chat: {
      completions: {
        async create() {
          throw providerError;
        },
      },
    },
  };
}

interface OpenAIClientLike {
  chat: { completions: { create(): Promise<never> } };
}

for (const scenario of scenarios) {
  test(`meeting-summary service fails closed on ${scenario.label}`, async () => {
    await assert.rejects(
      () => generateSummary(
        "call-1",
        "simple",
        `Meeting transcript ${scenario.label}`,
        { userId: "user-1", role: "viewer" },
        {
          client: failingClient(scenario.error) as never,
          loadCall: async () => ({
            id: "call-1",
            title: "Review",
            startedBy: "user-1",
            projectId: null,
            createdAt: new Date("2026-08-03T10:00:00.000Z"),
            endedAt: null,
            participants: [],
          }),
          resolve: async () => resolvedContext("meeting-summary"),
        },
      ),
      (error: unknown) => {
        const failure = toSafeAiFailure("meeting-summary", error);
        assert.equal(failure.kind, scenario.expectedKind);
        assert.equal(failure.message, scenario.expectedMessage);
        assert.doesNotMatch(JSON.stringify(failure), /UNVALIDATED_GENERATION|GROUNDING_CONTEXT/);
        return true;
      },
    );
  });

  test(`translation service fails closed on ${scenario.label}`, async () => {
    await assert.rejects(
      () => translateGroundedText({
        text: `Translate this ${scenario.label}`,
        targetLang: "fr",
        subject: { userId: "user-1", role: "viewer" },
      }, {
        client: failingClient(scenario.error) as never,
        resolve: async () => resolvedContext("translation"),
      }),
      (error: unknown) => {
        const failure = toSafeAiFailure("translation", error);
        assert.equal(failure.kind, scenario.expectedKind);
        assert.equal(failure.message, scenario.expectedMessage);
        assert.doesNotMatch(JSON.stringify(failure), /UNVALIDATED_GENERATION|GROUNDING_CONTEXT/);
        return true;
      },
    );
  });
}

test("streaming provider failures are normalised after the first chunk", async () => {
  const providerError = Object.assign(new Error("secret mid-stream timeout"), {
    code: "ETIMEDOUT",
  });
  const client = {
    chat: {
      completions: {
        async create() {
          return {
            async *[Symbol.asyncIterator]() {
              yield { choices: [] };
              throw providerError;
            },
          };
        },
      },
    },
  };
  const stream = await createOpenAIStructuredStream(client as never, {
    messages: [{ role: "user", content: "Ground this request" }],
  }, {
    model: "surface-model-unchanged",
    temperature: 0.2,
    schemaName: "GroundedAnswer",
    schema: OUTPUT_SCHEMA,
  });

  await assert.rejects(async () => {
    for await (const chunk of stream) {
      // Consume the stream so failures after headers are exercised.
      void chunk;
    }
  }, (error: unknown) => {
    const failure = toSafeAiFailure("dbs-gpt", error);
    assert.equal(failure.kind, "timeout");
    assert.doesNotMatch(failure.message, /secret/);
    return true;
  });
});
