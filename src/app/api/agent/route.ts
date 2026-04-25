import { NextRequest } from "next/server";
import OpenAI from "openai";
import { auth } from "@/lib/auth";
import { DBS_AGENT_SYSTEM_PROMPT } from "@/lib/agent/prompt";
import { AGENT_TOOLS, executeTool } from "@/lib/agent/tools";
import { buildArtifactsFromToolResult } from "@/lib/agent/artifacts";
import { AGENT_RESPONSE_SCHEMA, parseAgentResponse } from "@/lib/agent/blocks";
import { aiDisabledResponse, isAiDisabled } from "@/lib/ai-flags";

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

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const { messages } = (await req.json()) as {
    messages: OpenAI.Chat.ChatCompletionMessageParam[];
  };
  const latestUserMessage = [...messages]
    .reverse()
    .find((message) => message.role === "user" && message.content);
  const latestUserPrompt =
    typeof latestUserMessage?.content === "string"
      ? latestUserMessage.content
      : Array.isArray(latestUserMessage?.content)
        ? latestUserMessage.content
            .map((item) => ("text" in item && typeof item.text === "string" ? item.text : ""))
            .join(" ")
        : "";

  const systemPrompt = DBS_AGENT_SYSTEM_PROMPT.replace(
    "{today_date}",
    new Date().toISOString().split("T")[0],
  )
    .replace("{user_name}", session.user.name ?? "User")
    .replace("{user_role}", (session.user as { role?: string }).role ?? "viewer");

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        const history: OpenAI.Chat.ChatCompletionMessageParam[] = [
          { role: "system", content: systemPrompt },
          ...messages,
        ];

        let round = 0;
        let finalContent = "";

        // Agentic loop — model reasons, calls tools in parallel, then emits
        // a structured `blocks` envelope as its final answer.
        while (round < MAX_TOOL_ROUNDS) {
          round++;

          // Every call asks for either (a) a tool call or (b) JSON matching
          // the block schema. The model cannot emit free Markdown.
          const response = await openai.chat.completions.create({
            // gpt-4.1-mini: ~2.5x the cost of 4o-mini but markedly stronger
            // reasoning + structured-output compliance. Within Tier 1 quota
            // on this account (verified).
            model: "gpt-4.1-mini",
            messages: history,
            tools: AGENT_TOOLS,
            tool_choice: "auto",
            temperature: 0.2,
            max_tokens: 4096,
            stream: true,
            response_format: {
              type: "json_schema",
              json_schema: {
                name: "AgentResponse",
                strict: true,
                schema: AGENT_RESPONSE_SCHEMA as Record<string, unknown>,
              },
            },
          });

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

            const toolResults = await Promise.all(
              toolCalls.map(async (tc) => {
                let args: Record<string, unknown> = {};
                try {
                  args = JSON.parse(tc.function.arguments || "{}");
                } catch {
                  args = {};
                }

                send({ type: "tool_call", name: tc.function.name, args });

                let result: unknown;
                try {
                  result = await executeTool(tc.function.name, args);
                } catch (err) {
                  result = { error: `Tool execution failed: ${String(err)}` };
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

                send({ type: "tool_result", name: tc.function.name });

                return {
                  role: "tool" as const,
                  tool_call_id: tc.id,
                  content: JSON.stringify(result),
                };
              }),
            );

            history.push(...toolResults);
          }
        }

        // Parse the final JSON envelope. If parsing fails (schema drift or
        // truncation), fall back to rendering the raw text as a single prose
        // block so the user always sees something.
        const parsed = parseAgentResponse(finalContent);
        if (parsed) {
          send({ type: "blocks", blocks: parsed.blocks });
        } else if (finalContent) {
          send({
            type: "blocks",
            blocks: [{ type: "prose", text: finalContent }],
          });
        } else {
          send({
            type: "blocks",
            blocks: [
              {
                type: "prose",
                text: "I couldn't produce an answer for that. Please rephrase or try a narrower question.",
              },
            ],
          });
        }

        send({ type: "done" });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        send({ type: "error", message });
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
