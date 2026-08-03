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
import type { ResolvedContext } from "@/platform/ai/grounding";

/** Keep this many of the latest assistant turns with full tool replays. */
export const FULL_TOOL_TURNS = 5;

/** Remove client-controlled system/tool roles from the legacy chat contract. */
export function sanitiseLegacyHistory(
  messages: OpenAI.Chat.ChatCompletionMessageParam[],
): OpenAI.Chat.ChatCompletionMessageParam[] {
  return messages.flatMap((message) => {
    if (message.role !== "user" && message.role !== "assistant") return [];
    if (typeof message.content === "string") {
      return [{ role: message.role, content: message.content }];
    }
    if (message.role !== "user" || !Array.isArray(message.content)) return [];
    const text = message.content
      .flatMap((part) => ("text" in part && typeof part.text === "string" ? [part.text] : []))
      .join(" ");
    return text ? [{ role: "user" as const, content: text }] : [];
  });
}

function normaliseReference(value: string): string {
  return value.trim().toLocaleLowerCase("en");
}

function collectProjectReferences(value: unknown, references: Set<string>): void {
  if (typeof value === "string") {
    for (const code of value.match(/\bDBS-?\d[A-Z0-9]*(?:-[A-Z0-9]+)*\b/gi) ?? []) {
      references.add(code);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectProjectReferences(item, references));
    return;
  }
  if (typeof value !== "object" || value === null) return;

  const record = value as Record<string, unknown>;
  for (const key of ["projectId", "project_id", "projectCode", "project_code"] as const) {
    if (typeof record[key] === "string") references.add(record[key]);
  }
  const looksLikeProject = ["code", "phase", "client", "commune", "workStatus"]
    .some((key) => key in record);
  if (looksLikeProject && typeof record.id === "string") references.add(record.id);
  if (looksLikeProject && typeof record.code === "string") references.add(record.code);
  Object.values(record).forEach((child) => collectProjectReferences(child, references));
}

function messageProjectReferences(
  message: OpenAI.Chat.ChatCompletionMessageParam,
): Set<string> {
  const references = new Set<string>();
  if (message.role === "assistant" && Array.isArray(message.tool_calls)) {
    for (const call of message.tool_calls) {
      if (call.type !== "function") continue;
      try {
        collectProjectReferences(JSON.parse(call.function.arguments), references);
      } catch {
        collectProjectReferences(call.function.arguments, references);
      }
    }
  }

  const content = "content" in message ? message.content : null;
  if (typeof content === "string") {
    try {
      collectProjectReferences(JSON.parse(content), references);
    } catch {
      collectProjectReferences(content, references);
      for (const match of content.matchAll(/\bproject(?:_?id)?\s*[:=]\s*([A-Z0-9_-]+)/gi)) {
        references.add(match[1]);
      }
    }
  }
  return references;
}

function isGroundedHistoryMessage(
  message: OpenAI.Chat.ChatCompletionMessageParam,
  allowedProjects: Set<string>,
): boolean {
  return [...messageProjectReferences(message)]
    .every((reference) => allowedProjects.has(normaliseReference(reference)));
}

/**
 * Remove historical assistant/tool data that no longer falls inside the
 * caller's current project scope. User messages remain so follow-up intent is
 * preserved, but stale tool round-trips and the answer derived from them are
 * discarded as one atomic group.
 */
export function filterHistoryForGrounding(
  messages: OpenAI.Chat.ChatCompletionMessageParam[],
  resolved: ResolvedContext,
): OpenAI.Chat.ChatCompletionMessageParam[] {
  const allowedProjects = new Set(
    resolved.projects.flatMap((project) => [project.id, project.code]).map(normaliseReference),
  );
  const filtered: OpenAI.Chat.ChatCompletionMessageParam[] = [];

  for (let index = 0; index < messages.length; index++) {
    const message = messages[index];
    if (message.role === "assistant" && Array.isArray(message.tool_calls) && message.tool_calls.length) {
      const group: OpenAI.Chat.ChatCompletionMessageParam[] = [message];
      let cursor = index + 1;
      while (cursor < messages.length && messages[cursor].role === "tool") {
        group.push(messages[cursor]);
        cursor++;
      }
      if (cursor < messages.length && messages[cursor].role === "assistant") {
        group.push(messages[cursor]);
        cursor++;
      }
      if (group.every((item) => isGroundedHistoryMessage(item, allowedProjects))) {
        filtered.push(...group);
      }
      index = cursor - 1;
      continue;
    }

    if (message.role !== "assistant" || isGroundedHistoryMessage(message, allowedProjects)) {
      filtered.push(message);
    }
  }
  return filtered;
}

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
