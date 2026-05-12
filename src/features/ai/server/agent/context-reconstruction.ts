// Server-side context reconstruction for DBS GPT.
//
// On every /api/agent request we load the chat session's prior messages
// and rebuild an OpenAI Chat Completions message array that includes
// the assistant's previous tool_calls AND each tool's result. This
// gives the model continuous memory across turns — it can refer back
// to "the 4 stuck CHANTIER projects we talked about" without having
// to re-call the tool.
//
// Memory bounding: only the most recent N tool-bearing assistant turns
// keep their tool_calls + tool messages in full. Older turns are
// collapsed into a single system reminder so the context window stays
// stable as conversations grow long. The cap (FULL_TOOL_TURNS) is
// chosen so a worst-case session stays well below gpt-4.1-mini's 128K
// token window.

import type OpenAI from "openai";
import { parseStoredAssistantMessage } from "@/features/ai/server/agent/artifacts";

/** Keep this many of the latest assistant turns with full tool replays. */
export const FULL_TOOL_TURNS = 5;

interface DbMessage {
  id: string;
  role: string;
  content: string;
  createdAt: Date;
}

/**
 * Build OpenAI message history from a chat session's persisted messages.
 *
 * Order:
 *   for each user/assistant pair:
 *     - { role: "user", ... }
 *     - if assistant had tool calls (recent turn):
 *         { role: "assistant", content: null, tool_calls: [...] }
 *         { role: "tool", tool_call_id, content } × N
 *         (then the assistant's text response, if any)
 *     - else if assistant turn was older than FULL_TOOL_TURNS:
 *         single condensed "memory hint" line + the assistant text
 *
 * The caller appends the new user message after this.
 */
export function reconstructHistory(
  rows: DbMessage[],
): OpenAI.Chat.ChatCompletionMessageParam[] {
  // Collect assistant indices so we can identify the "last N" cutoff
  const assistantIndices: number[] = [];
  rows.forEach((r, i) => {
    if (r.role === "assistant") assistantIndices.push(i);
  });
  const fullThreshold = assistantIndices.length - FULL_TOOL_TURNS;
  // assistant message at row index i is "recent" if its position in
  // assistantIndices is >= fullThreshold
  const recentIdxSet = new Set(assistantIndices.slice(Math.max(0, fullThreshold)));

  const out: OpenAI.Chat.ChatCompletionMessageParam[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];

    if (row.role === "user") {
      out.push({ role: "user", content: row.content });
      continue;
    }

    if (row.role !== "assistant") continue;
    const parsed = parseStoredAssistantMessage(row.content);
    const stepsWithCalls = parsed.steps.filter(
      (s) => s.toolCallId && (s.result !== undefined),
    );

    const isRecent = recentIdxSet.has(i);

    if (isRecent && stepsWithCalls.length > 0) {
      // Replay the full tool round-trip so the model has the actual data.
      out.push({
        role: "assistant",
        content: null,
        tool_calls: stepsWithCalls.map((s) => ({
          id: s.toolCallId!,
          type: "function" as const,
          function: {
            name: s.name,
            arguments: JSON.stringify(s.args ?? {}),
          },
        })),
      });
      for (const s of stepsWithCalls) {
        out.push({
          role: "tool",
          tool_call_id: s.toolCallId!,
          content: s.result ?? "",
        });
      }
      // Then the assistant's final text response, if any.
      if (parsed.text) {
        out.push({ role: "assistant", content: parsed.text });
      }
    } else if (stepsWithCalls.length > 0) {
      // Older turn — drop the raw tool replay, leave a memory hint so
      // the model knows which tools were called without reloading the
      // bulk content.
      const hint = summariseTurnForMemory(stepsWithCalls.map((s) => ({
        name: s.name,
        args: s.args ?? {},
      })));
      const assistantText = parsed.text
        ? `${hint}\n\n${parsed.text}`
        : hint;
      out.push({ role: "assistant", content: assistantText });
    } else {
      // No tool calls — just the text response.
      out.push({ role: "assistant", content: parsed.text || "" });
    }
  }

  return out;
}

function summariseTurnForMemory(
  calls: Array<{ name: string; args: Record<string, unknown> }>,
): string {
  const summary = calls
    .map((c) => {
      const args = Object.entries(c.args)
        .filter(([, v]) => v !== null && v !== undefined && v !== "")
        .map(([k, v]) => `${k}=${typeof v === "object" ? JSON.stringify(v) : String(v)}`)
        .join(", ");
      return args ? `${c.name}(${args})` : c.name;
    })
    .join(" · ");
  return `[Earlier in this conversation: ${summary}. Re-call the tool if the user's follow-up depends on the exact contents.]`;
}
