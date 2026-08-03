/**
 * Provider-neutral policy for factual AI calls.
 *
 * Feature code supplies the model and output schema. This module preserves
 * the selected model, clamps factual extraction temperature, and makes a
 * structured response mandatory for both supported provider request shapes.
 */

import type OpenAI from "openai";
import type {
  ChatCompletion,
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionCreateParamsStreaming,
  ChatCompletionChunk,
} from "openai/resources/chat/completions";
import type { Stream } from "openai/streaming";

export const MAX_FACTUAL_TEMPERATURE = 0.2;

export type JsonObjectSchema = Readonly<Record<string, unknown>>;

export type AiProviderFailureKind =
  | "rate_limited"
  | "timeout"
  | "unavailable"
  | "invalid_output"
  | "provider_error";

const FAILURE_MESSAGES: Record<AiProviderFailureKind, string> = {
  rate_limited: "AI Assistant is temporarily busy. Please try again shortly.",
  timeout: "AI Assistant did not receive a response in time. Please try again.",
  unavailable: "AI Assistant is temporarily unavailable. Please try again shortly.",
  invalid_output: "AI Assistant could not produce a validated response. Please try again.",
  provider_error: "AI Assistant could not complete this request. Please try again.",
};

export class AiProviderFailure extends Error {
  readonly kind: AiProviderFailureKind;
  readonly status?: number;
  readonly retryable: boolean;

  constructor(
    kind: AiProviderFailureKind,
    options: { status?: number; cause?: unknown } = {},
  ) {
    super(FAILURE_MESSAGES[kind]);
    this.name = "AiProviderFailure";
    this.kind = kind;
    this.status = options.status;
    this.retryable = kind === "rate_limited" || kind === "timeout" || kind === "unavailable";
    if (options.cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = options.cause;
    }
  }
}

export interface OpenAIStructuredPolicyInput {
  model: string;
  temperature: number;
  schemaName: string;
  schema: JsonObjectSchema;
}

export interface OpenAIStructuredPolicy {
  model: string;
  temperature: number;
  response_format: {
    type: "json_schema";
    json_schema: {
      name: string;
      strict: true;
      schema: JsonObjectSchema;
    };
  };
}

export interface AnthropicStructuredPolicyInput {
  model: string;
  temperature: number;
  toolName: string;
  toolDescription: string;
  schema: JsonObjectSchema;
}

export interface AnthropicStructuredPolicy {
  model: string;
  temperature: number;
  tools: [
    {
      name: string;
      description: string;
      input_schema: JsonObjectSchema;
    },
  ];
  tool_choice: {
    type: "tool";
    name: string;
  };
}

type OpenAINonStreamingRequest = Omit<
  ChatCompletionCreateParamsNonStreaming,
  "model" | "temperature" | "response_format" | "stream"
>;

type OpenAIStreamingRequest = Omit<
  ChatCompletionCreateParamsStreaming,
  "model" | "temperature" | "response_format" | "stream"
>;

export function clampFactualTemperature(temperature: number): number {
  if (!Number.isFinite(temperature)) {
    throw new TypeError("Factual extraction temperature must be a finite number.");
  }
  return Math.min(MAX_FACTUAL_TEMPERATURE, Math.max(0, temperature));
}

export function buildOpenAIStructuredPolicy(
  input: OpenAIStructuredPolicyInput,
): OpenAIStructuredPolicy {
  assertPolicyInput(input.model, input.schemaName, input.schema);
  return {
    model: input.model,
    temperature: clampFactualTemperature(input.temperature),
    response_format: {
      type: "json_schema",
      json_schema: {
        name: input.schemaName,
        strict: true,
        schema: input.schema,
      },
    },
  };
}

export function buildAnthropicStructuredPolicy(
  input: AnthropicStructuredPolicyInput,
): AnthropicStructuredPolicy {
  assertPolicyInput(input.model, input.toolName, input.schema);
  if (!input.toolDescription.trim()) {
    throw new TypeError("Anthropic output tool description is required.");
  }
  return {
    model: input.model,
    temperature: clampFactualTemperature(input.temperature),
    tools: [
      {
        name: input.toolName,
        description: input.toolDescription,
        input_schema: input.schema,
      },
    ],
    tool_choice: {
      type: "tool",
      name: input.toolName,
    },
  };
}

/** The only non-streaming OpenAI generation entry point AI surfaces use. */
export async function createOpenAIStructuredCompletion(
  client: OpenAI,
  request: OpenAINonStreamingRequest,
  policyInput: OpenAIStructuredPolicyInput,
): Promise<ChatCompletion> {
  try {
    return await client.chat.completions.create({
      ...request,
      ...buildOpenAIStructuredPolicy(policyInput),
      stream: false,
    });
  } catch (error) {
    throw classifyProviderError(error);
  }
}

/** The only streaming OpenAI generation entry point AI surfaces use. */
export async function createOpenAIStructuredStream(
  client: OpenAI,
  request: OpenAIStreamingRequest,
  policyInput: OpenAIStructuredPolicyInput,
): Promise<Stream<ChatCompletionChunk>> {
  try {
    return await client.chat.completions.create({
      ...request,
      ...buildOpenAIStructuredPolicy(policyInput),
      stream: true,
    });
  } catch (error) {
    throw classifyProviderError(error);
  }
}

/**
 * Decode provider output and pass it through the feature's runtime schema.
 * Plain text and arrays are rejected so callers cannot silently downgrade to
 * an unstructured response when a provider drifts from its request contract.
 */
export function parseStructuredOutput<T>(
  raw: unknown,
  parse: (value: Record<string, unknown>) => T,
): T {
  try {
    const decoded = typeof raw === "string" ? JSON.parse(raw) as unknown : raw;
    if (typeof decoded !== "object" || decoded === null || Array.isArray(decoded)) {
      throw new Error("Structured output must be a JSON object.");
    }
    return parse(decoded as Record<string, unknown>);
  } catch (error) {
    if (error instanceof AiProviderFailure) throw error;
    throw new AiProviderFailure("invalid_output", { cause: error });
  }
}

export function classifyProviderError(error: unknown): AiProviderFailure {
  if (error instanceof AiProviderFailure) return error;

  const status = readStatus(error);
  if (status === 429) {
    return new AiProviderFailure("rate_limited", { status, cause: error });
  }
  if (isTimeout(error)) {
    return new AiProviderFailure("timeout", { status, cause: error });
  }
  if (status !== undefined && status >= 500) {
    return new AiProviderFailure("unavailable", { status, cause: error });
  }
  return new AiProviderFailure("provider_error", { status, cause: error });
}

function assertPolicyInput(model: string, schemaName: string, schema: JsonObjectSchema): void {
  if (!model.trim()) throw new TypeError("AI model is required.");
  if (!schemaName.trim()) throw new TypeError("Structured output schema name is required.");
  if (schema.type !== "object") {
    throw new TypeError("Structured output schema must describe a JSON object.");
  }
  assertStrictObjectSchemas(schema, schemaName);
}

function assertStrictObjectSchemas(value: unknown, path: string): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertStrictObjectSchemas(item, `${path}[${index}]`));
    return;
  }
  if (typeof value !== "object" || value === null) return;

  const record = value as Record<string, unknown>;
  if (record.type === "object") {
    if (record.additionalProperties !== false) {
      throw new TypeError(`${path} must set additionalProperties to false.`);
    }
    const properties = record.properties;
    const required = record.required;
    if (typeof properties !== "object" || properties === null || Array.isArray(properties)) {
      throw new TypeError(`${path} must declare object properties.`);
    }
    if (!Array.isArray(required)) {
      throw new TypeError(`${path} must require every object property.`);
    }
    const requiredNames = new Set(required.filter((item): item is string => typeof item === "string"));
    for (const propertyName of Object.keys(properties)) {
      if (!requiredNames.has(propertyName)) {
        throw new TypeError(`${path}.${propertyName} must be required.`);
      }
    }
  }

  for (const [key, child] of Object.entries(record)) {
    if (key !== "description") assertStrictObjectSchemas(child, `${path}.${key}`);
  }
}

function readStatus(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const record = error as Record<string, unknown>;
  const direct = record.status ?? record.statusCode;
  if (typeof direct === "number") return direct;
  if (typeof record.response === "object" && record.response !== null) {
    const response = record.response as Record<string, unknown>;
    const nested = response.status ?? response.statusCode;
    if (typeof nested === "number") return nested;
  }
  return undefined;
}

function isTimeout(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const record = error as Record<string, unknown>;
  const name = typeof record.name === "string" ? record.name.toLowerCase() : "";
  const code = typeof record.code === "string" ? record.code.toUpperCase() : "";
  const message = typeof record.message === "string" ? record.message : "";
  return (
    name === "timeouterror" ||
    name === "aborterror" ||
    code === "ETIMEDOUT" ||
    code === "ECONNABORTED" ||
    code.includes("TIMEOUT") ||
    /timed?\s*out|timeout/i.test(message)
  );
}
