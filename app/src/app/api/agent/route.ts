import { NextRequest } from "next/server";
import OpenAI from "openai";
import { auth } from "@/platform/auth";
import { prisma } from "@/platform/db";
import { loadAttachmentContext } from "@/features/ai/server/ingest/load-attachment-context";
import { DBS_AGENT_SYSTEM_PROMPT } from "@/features/ai/server/agent/prompt";
import { AGENT_TOOLS, executeTool } from "@/features/ai/server/agent/tools";
import { buildArtifactsFromToolResult } from "@/features/ai/server/agent/artifacts";
import { AGENT_RESPONSE_SCHEMA, parseAgentResponse } from "@/features/ai/server/agent/blocks";
import { aiDisabledResponse, isAiDisabled } from "@/features/ai/domain/ai-flags";
import {
  filterHistoryForGrounding,
  reconstructHistory,
  sanitiseLegacyHistory,
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

// Max tool call rounds to prevent infinite loops
const MAX_TOOL_ROUNDS = 6;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 });
  }

  // Cost-control window: short-circuit before constructing the OpenAI
  // client so a missing/removed key never produces a cryptic 401.
  if (isAiDisabled()) return aiDisabledResponse();

  // New contract: client sends just the new user message + sessionId.
  // Server reconstructs the full prior conversation (including past tool
  // calls + their results) from the DB so multi-turn memory works
  // properly. Backwards-compatible: if no sessionId is given (legacy
  // client) we fall back to the messages array the client supplied.
  const body = (await req.json()) as {
    messages?: OpenAI.Chat.ChatCompletionMessageParam[];
    sessionId?: string;
    message?: string;
  };

  let priorHistory: OpenAI.Chat.ChatCompletionMessageParam[] = [];
  let latestUserPrompt = "";

  if (body.sessionId && typeof body.message === "string" && body.message.trim()) {
    // Verify ownership and load history from DB.
    const chat = await prisma.aiChatSession.findFirst({
      where: { id: body.sessionId, userId: session.user.id },
      include: { messages: { orderBy: { createdAt: "asc" } } },
    });
    if (chat) {
      priorHistory = reconstructHistory(chat.messages);
    }
    latestUserPrompt = body.message;
    priorHistory.push({ role: "user", content: body.message });
  } else if (Array.isArray(body.messages)) {
    priorHistory = sanitiseLegacyHistory(body.messages);
    const latest = [...priorHistory]
      .reverse()
      .find((m) => m.role === "user" && m.content);
    latestUserPrompt =
      typeof latest?.content === "string"
        ? latest.content
        : Array.isArray(latest?.content)
          ? latest.content
              .map((it) => ("text" in it && typeof it.text === "string" ? it.text : ""))
              .join(" ")
          : "";
  } else {
    return Response.json({ error: "Missing message or sessionId" }, { status: 400 });
  }

  const userRole = (session.user as { role?: string }).role ?? "viewer";
  const surface = surfaceForAgentRequest(latestUserPrompt, Boolean(body.sessionId));
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
   * Failure here is non-fatal: an assistant that answers from workspace
   * context alone is far better than one that refuses because a file could
   * not be read.
   */
  let attachmentPrompt = "";
  try {
    const attachmentContext = await loadAttachmentContext({
      userId: session.user.id,
      sessionId: body.sessionId ?? null,
    });
    attachmentPrompt = attachmentContext.prompt;
  } catch (err) {
    console.warn("[agent] attachment context unavailable", err);
  }

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
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

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
        send({ type: "blocks", blocks: validated.output.blocks });

        send({ type: "done" });
      } catch (err) {
        const failure = toSafeAiFailure(surface, err);
        send({ type: "error", kind: failure.kind, message: failure.message });
      } finally {
        controller.close();
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
