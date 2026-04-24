import { NextRequest } from "next/server";
import OpenAI from "openai";
import { auth } from "@/lib/auth";
import { DBS_AGENT_SYSTEM_PROMPT } from "@/lib/agent/prompt";
import { AGENT_TOOLS, executeTool } from "@/lib/agent/tools";
import { buildArtifactsFromToolResult } from "@/lib/agent/artifacts";

// Max tool call rounds to prevent infinite loops
const MAX_TOOL_ROUNDS = 6;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const { messages } = await req.json() as {
    messages: OpenAI.Chat.ChatCompletionMessageParam[];
  };
  const latestUserMessage = [...messages]
    .reverse()
    .find((message) => message.role === "user" && message.content);
  const latestUserPrompt = typeof latestUserMessage?.content === "string"
    ? latestUserMessage.content
    : Array.isArray(latestUserMessage?.content)
    ? latestUserMessage.content
        .map((item) => ("text" in item && typeof item.text === "string" ? item.text : ""))
        .join(" ")
    : "";

  const systemPrompt = DBS_AGENT_SYSTEM_PROMPT
    .replace("{today_date}", new Date().toISOString().split("T")[0])
    .replace("{user_name}", session.user.name ?? "User")
    .replace("{user_role}", (session.user as { role?: string }).role ?? "viewer");

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        // Build message history with system prompt
        const history: OpenAI.Chat.ChatCompletionMessageParam[] = [
          { role: "system", content: systemPrompt },
          ...messages,
        ];

        let round = 0;

        // Agentic loop — model reasons → calls tools → observes → continues
        while (round < MAX_TOOL_ROUNDS) {
          round++;

          const response = await openai.chat.completions.create({
            // gpt-4o-mini: ~20× cheaper than gpt-4o with far more generous
            // per-minute rate limits on Tier 0/1 accounts. Quality is ample
            // for DBS's grounded-tool-use workload (supervised by the
            // system prompt + deterministic tools in AGENT_TOOLS).
            model: "gpt-4o-mini",
            messages: history,
            tools: AGENT_TOOLS,
            tool_choice: "auto",
            temperature: 0.2,
            max_tokens: 4096,
            stream: round === 1 || true, // always stream final text
          });

          // Collect the full response (non-streaming for tool calls, streaming for final text)
          let assistantContent = "";
          const toolCalls: { id: string; type: "function"; function: { name: string; arguments: string } }[] = [];
          let finishReason = "";

          // Non-streaming collection for tool call rounds
          for await (const chunk of response as AsyncIterable<OpenAI.Chat.ChatCompletionChunk>) {
            const choice = chunk.choices[0];
            if (!choice) continue;

            finishReason = choice.finish_reason ?? finishReason;

            const delta = choice.delta;

            // Accumulate text content
            if (delta.content) {
              assistantContent += delta.content;
              send({ type: "text", content: delta.content });
            }

            // Accumulate tool calls
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
                if (tc.function?.arguments) toolCalls[idx].function.arguments += tc.function.arguments;
              }
            }
          }

          // Add assistant message to history
          const assistantMessage: OpenAI.Chat.ChatCompletionMessageParam = toolCalls.length > 0
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

          // If no tool calls, we're done
          if (finishReason === "stop" || toolCalls.length === 0) {
            break;
          }

          // Execute all tool calls in parallel
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

                const artifacts = buildArtifactsFromToolResult(tc.function.name, args, result, latestUserPrompt);
                for (const artifact of artifacts) {
                  send({ type: "artifact", artifact });
                }

                send({ type: "tool_result", name: tc.function.name });

                return {
                  role: "tool" as const,
                  tool_call_id: tc.id,
                  content: JSON.stringify(result),
                };
              })
            );

            // Add all tool results to history
            history.push(...toolResults);
          }
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
