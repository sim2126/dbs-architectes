import { NextRequest } from "next/server";
import OpenAI from "openai";
import { auth } from "@/platform/auth";
import { prisma } from "@/platform/db";
import {
  loadAttachmentContext,
  type AttachmentContext,
} from "@/features/ai/server/ingest/load-attachment-context";
import { DBS_AGENT_SYSTEM_PROMPT } from "@/features/ai/server/agent/prompt";
import { AGENT_TOOLS, executeTool } from "@/features/ai/server/agent/tools";
import { buildArtifactsFromToolResult } from "@/features/ai/server/agent/artifacts";
import {
  AGENT_RESPONSE_SCHEMA,
  blocksToPlainText,
  parseAgentResponse,
  type Block,
} from "@/features/ai/server/agent/blocks";
import {
  generateSessionTitle,
  serializeAssistantMessage,
  type AiArtifact,
  type PersistedToolStep,
} from "@/features/ai/server/agent/artifacts";
import { aiDisabledResponse, isAiDisabled } from "@/features/ai/domain/ai-flags";
import {
  filterHistoryForGrounding,
  MAX_HISTORY_TURNS,
  reconstructHistory,
} from "@/features/ai/server/agent/context-reconstruction";
import {
  extendGroundingWithTrustedToolResult,
  resolveGrounding,
  serialiseResolvedContext,
  type ResolvedContext,
} from "@/platform/ai/grounding";
import {
  buildAgentGroundingContract,
  surfaceForAgentRequest,
} from "@/platform/ai/contracts";
import {
  AiProviderFailure,
  createOpenAIStructuredStream,
  parseStructuredOutput,
  toSafeAiFailure,
} from "@/platform/ai/provider";
import { validateGrounding } from "@/platform/ai/validation";
import { requireAiAccess } from "@/platform/ai/access";
import {
  acquireAiAgentLease,
  consumeAiRequestQuota,
  refundAiRequestQuota,
  releaseAiAgentLease,
} from "@/platform/ai/request-guard";
import { rateLimitedResponse } from "@/platform/auth/rate-limit";

// Max tool call rounds to prevent infinite loops
const MAX_TOOL_ROUNDS = 6;
const MAX_AGENT_MESSAGE_CHARS = 20_000;
const MAX_AGENT_REQUEST_BYTES = 96 * 1024;

/**
 * Execution ceiling for the agent loop.
 *
 * Without this the platform default applies, and a request killed at that
 * default leaves the concurrency lease behind — the lease release runs in a
 * `finally` inside the stream, which a killed function never reaches.
 *
 * 120s matches calls/[id]/summarize and gives twice the headroom over the
 * stated target of under 60 seconds for a detailed answer. LEASE_TTL_MS in
 * platform/ai/request-guard.ts is derived from this number; move them together.
 */
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const access = await requireAiAccess(req);
  if (!access.allowed) return access.response;

  // Cost-control window: short-circuit before constructing the OpenAI
  // client so a missing/removed key never produces a cryptic 401.
  if (isAiDisabled()) return aiDisabledResponse();

  let body: {
    sessionId?: string;
    message?: string;
  } | null;
  try {
    body = await readAgentRequest(req);
  } catch (error) {
    if (error instanceof AgentRequestTooLargeError) {
      return Response.json({ error: error.message }, { status: 413 });
    }
    throw error;
  }
  if (
    !body ||
    typeof body.sessionId !== "string" ||
    body.sessionId.length > 100 ||
    typeof body.message !== "string" ||
    !body.message.trim()
  ) {
    return Response.json({ error: "Missing message or sessionId" }, { status: 400 });
  }
  if (body.message.trim().length > MAX_AGENT_MESSAGE_CHARS) {
    return Response.json(
      { error: `Messages are limited to ${MAX_AGENT_MESSAGE_CHARS.toLocaleString("en-GB")} characters.` },
      { status: 413 },
    );
  }

  let requestLimit;
  try {
    requestLimit = await consumeAiRequestQuota(access.subject.userId);
  } catch {
    return Response.json(
      { error: "AI Assistant request controls are unavailable. Please try again shortly." },
      { status: 503 },
    );
  }
  if (!requestLimit.allowed) {
    return rateLimitedResponse(
      requestLimit.retryAfterMs,
      "AI Assistant request limit reached. Please wait before trying again.",
    );
  }

  const chatSessionId = body.sessionId;

  const chat = await prisma.aiChatSession.findFirst({
    where: { id: chatSessionId, userId: session.user.id },
    include: {
      messages: {
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: MAX_HISTORY_TURNS * 2,
      },
    },
  });
  if (!chat) {
    return Response.json({ error: "Conversation not found." }, { status: 404 });
  }
  const latestUserPrompt = body.message.trim();
  let priorHistory = reconstructHistory([...chat.messages].reverse());
  priorHistory.push({ role: "user", content: latestUserPrompt });
  const isFirstTurn = chat.messages.length === 0;

  const userRole = access.subject.role;
  const surface = surfaceForAgentRequest(latestUserPrompt, true);
  let resolvedContext: ResolvedContext;
  try {
    resolvedContext = await resolveGrounding(buildAgentGroundingContract({
      surface,
      subject: { userId: session.user.id, role: userRole },
      input: latestUserPrompt,
    }));
  } catch {
    return Response.json(
      { error: "AI Assistant could not verify the workspace context. Please try again." },
      { status: 503 },
    );
  }
  priorHistory = filterHistoryForGrounding(priorHistory, resolvedContext);

  /*
   * Attachment text, if any, as a SEPARATE system message.
   *
   * Deliberately not merged into the grounding block. Grounding is
   * authoritative — we resolved every value in it. Attachment text is
   * whatever a user uploaded, and presenting the two as one would make an
   * uploaded PDF an instruction channel. Its own message, with its own
   * framing, keeps the trust boundary visible to the model.
   *
   * Failure is closed: answering as though an attached document was read is
   * silent corruption, even if the workspace-only answer sounds plausible.
   */
  let attachmentContext: AttachmentContext;
  try {
    attachmentContext = await loadAttachmentContext({
      userId: session.user.id,
      sessionId: chatSessionId,
    });
  } catch {
    return Response.json(
      { error: "AI Assistant could not verify the attached files. Please try again." },
      { status: 503 },
    );
  }
  if (attachmentContext.unavailable.length > 0) {
    const processing = attachmentContext.unavailable.filter(
      (file) => file.state === "processing",
    );
    const failed = attachmentContext.unavailable.filter((file) => file.state === "failed");
    const details = [
      processing.length
        ? `Still reading: ${processing.map((file) => file.filename).join(", ")}.`
        : "",
      failed.length
        ? `Could not read: ${failed.map((file) => file.filename).join(", ")}. Remove or retry the file before asking about it.`
        : "",
    ].filter(Boolean).join(" ");
    return Response.json(
      { error: `AI Assistant cannot answer with incomplete attachment context. ${details}` },
      { status: 409 },
    );
  }
  const attachmentPrompt = attachmentContext.prompt;

  const systemPrompt = DBS_AGENT_SYSTEM_PROMPT.replace(
    "{today_date}",
    new Date().toISOString().split("T")[0],
  )
    .replace("{user_name}", session.user.name ?? "User")
    .replace("{user_role}", userRole);
  const buildGroundingPrompt = (context: ResolvedContext) => [
      "Authoritative, access-scoped grounding context follows as JSON.",
      "Use only resolved entity identifiers and values. Do not invent users, projects, phases, dates, or meeting decisions.",
      "Every final response must include userIds, projectIds, phases, and dates arrays alongside blocks.",
      "List the exact resolved IDs or values for every entity referenced in the blocks; use empty arrays when none are referenced.",
      serialiseResolvedContext(context),
    ].join("\n");
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    timeout: 60_000,
    maxRetries: 1,
  });

  const agentRequestId = crypto.randomUUID();
  let lease;
  try {
    lease = await acquireAiAgentLease(access.subject.userId, agentRequestId);
  } catch {
    return Response.json(
      { error: "AI Assistant request controls are unavailable. Please try again shortly." },
      { status: 503 },
    );
  }
  if (!lease.allowed) {
    // The quota slot was taken before this check; hand it back rather than
    // charging the caller for a request that never reached the provider.
    await refundAiRequestQuota(requestLimit.eventId).catch(() => undefined);
    return Response.json(
      { error: "AI Assistant is already answering another request. Please wait for it to finish." },
      {
        status: 409,
        headers: { "Retry-After": String(Math.max(1, Math.ceil(lease.retryAfterMs / 1000))) },
      },
    );
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          // The browser may close while the provider is finishing. Persistence
          // remains server-owned and must still complete in that case.
        }
      };
      const persistedSteps: PersistedToolStep[] = [];
      const persistedArtifacts: AiArtifact[] = [];
      let turnPersisted = false;

      try {
        const history: OpenAI.Chat.ChatCompletionMessageParam[] = [
          { role: "system", content: systemPrompt },
          { role: "system", content: buildGroundingPrompt(resolvedContext) },
          ...(attachmentPrompt
            ? [
                {
                  role: "system" as const,
                  content: attachmentPrompt,
                },
              ]
            : []),
          ...priorHistory,
        ];

        let round = 0;
        let finalContent = "";

        // Agentic loop — model reasons, calls tools in parallel, then emits
        // a structured `blocks` envelope as its final answer.
        while (round < MAX_TOOL_ROUNDS) {
          round++;

          // Every call asks for either (a) a tool call or (b) JSON matching
          // the block schema. The model cannot emit free Markdown.
          const response = await createOpenAIStructuredStream(
            openai,
            {
              messages: history,
              tools: AGENT_TOOLS,
              tool_choice: "auto",
              max_tokens: 4096,
            },
            {
              // Keep the route's established model and factual temperature.
              model: "gpt-4.1-mini",
              temperature: 0.2,
              schemaName: "AgentResponse",
              schema: AGENT_RESPONSE_SCHEMA,
            },
          );

          let assistantContent = "";
          const toolCalls: Array<{
            id: string;
            type: "function";
            function: { name: string; arguments: string };
          }> = [];
          let finishReason = "";

          for await (const chunk of response as AsyncIterable<OpenAI.Chat.ChatCompletionChunk>) {
            const choice = chunk.choices[0];
            if (!choice) continue;

            finishReason = choice.finish_reason ?? finishReason;

            const delta = choice.delta;

            if (delta.content) {
              assistantContent += delta.content;
              // We don't stream per-token text in block mode — the UI waits
              // for the final `blocks` event, which it renders atomically.
            }

            if (delta.tool_calls) {
              for (const tc of delta.tool_calls) {
                const idx = tc.index;
                if (!toolCalls[idx]) {
                  toolCalls[idx] = {
                    id: tc.id ?? "",
                    type: "function",
                    function: { name: tc.function?.name ?? "", arguments: "" },
                  };
                }
                if (tc.id) toolCalls[idx].id = tc.id;
                if (tc.function?.name) toolCalls[idx].function.name = tc.function.name;
                if (tc.function?.arguments) {
                  toolCalls[idx].function.arguments += tc.function.arguments;
                }
              }
            }
          }

          const assistantMessage: OpenAI.Chat.ChatCompletionMessageParam =
            toolCalls.length > 0
              ? {
                  role: "assistant",
                  content: assistantContent || null,
                  tool_calls: toolCalls,
                }
              : {
                  role: "assistant",
                  content: assistantContent || null,
                };
          history.push(assistantMessage);

          if (finishReason === "stop" || toolCalls.length === 0) {
            finalContent = assistantContent;
            break;
          }

          if (toolCalls.length > 0) {
            send({ type: "tool_start", tools: toolCalls.map((tc) => tc.function.name) });

            const toolExecutions = await Promise.all(
              toolCalls.map(async (tc) => {
                let args: Record<string, unknown> = {};
                try {
                  args = JSON.parse(tc.function.arguments || "{}");
                } catch {
                  args = {};
                }

                send({
                  type: "tool_call",
                  name: tc.function.name,
                  args,
                  toolCallId: tc.id,
                });
                persistedSteps.push({
                  name: tc.function.name,
                  label: tc.function.name,
                  args,
                  status: "running",
                  toolCallId: tc.id,
                });

                let result: unknown;
                try {
                  result = await executeTool(tc.function.name, args, {
                    userId: session.user.id,
                    role: userRole,
                  });
                } catch (err) {
                  console.error("DBS AI tool execution failed", {
                    tool: tc.function.name,
                    errorType: err instanceof Error ? err.name : "unknown",
                  });
                  result = { error: "Tool execution failed" };
                }

                const artifacts = buildArtifactsFromToolResult(
                  tc.function.name,
                  args,
                  result,
                  latestUserPrompt,
                );
                for (const artifact of artifacts) {
                  persistedArtifacts.push(artifact);
                  send({ type: "artifact", artifact });
                }

                const resultStr = JSON.stringify(result);

                // Carry the tool result content so the client can
                // persist it on the step — that's what makes cross-turn
                // memory possible.
                send({
                  type: "tool_result",
                  name: tc.function.name,
                  toolCallId: tc.id,
                  result: resultStr.slice(0, 8000),
                });
                const persistedStep = persistedSteps.find(
                  (step) => step.toolCallId === tc.id,
                );
                if (persistedStep) {
                  persistedStep.status = "done";
                  persistedStep.result = resultStr.slice(0, 8000);
                }

                return {
                  message: {
                    role: "tool" as const,
                    tool_call_id: tc.id,
                    content: resultStr,
                  },
                  trustedResult: result,
                };
              }),
            );

            for (const execution of toolExecutions) {
              resolvedContext = extendGroundingWithTrustedToolResult(
                resolvedContext,
                execution.trustedResult,
              );
            }
            history[1] = { role: "system", content: buildGroundingPrompt(resolvedContext) };
            history.push(...toolExecutions.map((execution) => execution.message));
          }
        }

        const parsed = parseStructuredOutput(finalContent, (value) => {
          const response = parseAgentResponse(JSON.stringify(value));
          if (!response) throw new TypeError("Agent response does not match its block envelope.");
          return response;
        });
        const validated = validateGrounding(parsed, resolvedContext, { mode: "strip" });
        if (!validated.valid) {
          throw new AiProviderFailure("invalid_output");
        }
        if (validated.issues.length > 0) {
          console.warn("DBS AI grounding issues", { surface, issues: validated.issues });
          send({
            type: "grounding_issues",
            surface,
            issues: validated.issues,
          });
        }
        const responseBlocks: Block[] = [...validated.output.blocks];
        const truncatedFiles = attachmentContext.included.filter((file) => file.truncated);
        const attachmentLimitations = [
          truncatedFiles.length
            ? `Only part of ${truncatedFiles.map((file) => file.filename).join(", ")} was available for this answer.`
            : "",
          attachmentContext.omitted.length
            ? `${attachmentContext.omitted.length} older attached file(s) were outside this answer's context limit: ${attachmentContext.omitted.map((file) => file.filename).join(", ")}.`
            : "",
        ].filter(Boolean).join(" ");
        if (attachmentLimitations) {
          responseBlocks.push({
            type: "callout",
            tone: "warning",
            text: attachmentLimitations,
          });
        }

        const persisted = await persistAgentTurn({
          sessionId: chatSessionId,
          userContent: latestUserPrompt,
          assistantText: blocksToPlainText(responseBlocks),
          assistantBlocks: responseBlocks,
          artifacts: persistedArtifacts,
          steps: persistedSteps,
          isFirstTurn,
        });
        turnPersisted = true;
        send({ type: "blocks", blocks: responseBlocks });
        send({ type: "done", ...persisted });
      } catch (err) {
        const failure = toSafeAiFailure(surface, err);
        if (!turnPersisted) {
          try {
            const failureBlocks: Block[] = [
              { type: "callout", tone: "warning", text: failure.message },
            ];
            await persistAgentTurn({
              sessionId: chatSessionId,
              userContent: latestUserPrompt,
              assistantText: failure.message,
              assistantBlocks: failureBlocks,
              artifacts: persistedArtifacts,
              steps: persistedSteps,
              isFirstTurn,
            });
            turnPersisted = true;
          } catch {
            // The stream still returns a safe provider-style failure. The
            // persistence error remains server-side and is never serialised.
          }
        }
        send({ type: "error", kind: failure.kind, message: failure.message });
      } finally {
        await releaseAiAgentLease(access.subject.userId, agentRequestId).catch(() => undefined);
        try {
          controller.close();
        } catch {
          // Already cancelled by the browser.
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

class AgentRequestTooLargeError extends Error {
  constructor() {
    super("The AI Assistant request is too large.");
    this.name = "AgentRequestTooLargeError";
  }
}

async function readAgentRequest(req: NextRequest): Promise<{
  sessionId?: string;
  message?: string;
} | null> {
  const declaredLength = Number(req.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_AGENT_REQUEST_BYTES) {
    throw new AgentRequestTooLargeError();
  }
  if (!req.body) return null;

  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > MAX_AGENT_REQUEST_BYTES) {
        await reader.cancel();
        throw new AgentRequestTooLargeError();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  try {
    return JSON.parse(Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), received).toString("utf8")) as {
      sessionId?: string;
      message?: string;
    };
  } catch {
    return null;
  }
}

async function persistAgentTurn(input: {
  sessionId: string;
  userContent: string;
  assistantText: string;
  assistantBlocks: Block[];
  artifacts: AiArtifact[];
  steps: PersistedToolStep[];
  isFirstTurn: boolean;
}): Promise<{ sessionId: string; title?: string; updatedAt: string }> {
  const title = input.isFirstTurn ? generateSessionTitle(input.userContent) : undefined;
  const updatedAt = new Date();
  await prisma.$transaction([
    prisma.aiChatMessage.create({
      data: {
        sessionId: input.sessionId,
        role: "user",
        content: input.userContent,
      },
    }),
    prisma.aiChatMessage.create({
      data: {
        sessionId: input.sessionId,
        role: "assistant",
        content: serializeAssistantMessage({
          text: input.assistantText,
          artifacts: input.artifacts,
          steps: input.steps,
          blocks: input.assistantBlocks,
        }),
      },
    }),
    prisma.aiChatSession.update({
      where: { id: input.sessionId },
      data: { updatedAt, ...(title ? { title } : {}) },
    }),
  ]);
  return {
    sessionId: input.sessionId,
    ...(title ? { title } : {}),
    updatedAt: updatedAt.toISOString(),
  };
}
