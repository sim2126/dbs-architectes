import OpenAI from "openai";
import { z } from "zod";
import { prisma } from "@/platform/db";
import { randomBytes } from "crypto";
import {
  resolveGrounding,
  serialiseResolvedContext,
  type GroundingSubject,
  type ResolvedContext,
} from "@/platform/ai/grounding";
import { buildMeetingSummaryGroundingContract } from "@/platform/ai/contracts";
import {
  AiProviderFailure,
  createOpenAIStructuredCompletion,
  parseStructuredOutput,
} from "@/platform/ai/provider";
import { validateGrounding } from "@/platform/ai/validation";

// ── Shapes ─────────────────────────────────────────────────

export type SummaryMode = "simple" | "detailed";

const simpleSummarySchema = z.object({
  mode: z.literal("simple"),
  executive_summary: z.string(),
  key_points: z.array(z.string()),
  action_items: z.array(z.object({
    task: z.string(),
    owner: z.string().nullable(),
    due_date: z.string().nullable(),
  }).strict()),
  topics: z.array(z.string()),
  next_steps: z.array(z.string()),
  attendance: z.object({ present: z.array(z.string()) }).strict(),
  language: z.string(),
  user_ids: z.array(z.string()),
  project_ids: z.array(z.string()),
  phases: z.array(z.string()),
  dates: z.array(z.string()),
}).strict();

const detailedSummarySchema = z.object({
  mode: z.literal("detailed"),
  executive_summary: z.string(),
  narrative: z.string(),
  decisions_made: z.array(z.object({
    what: z.string(),
    who_decided: z.string().nullable(),
    who_decided_user_id: z.string().nullable(),
    confidence: z.enum(["high", "medium", "low"]),
    conflicts_with_prior: z.string().nullable(),
  }).strict()),
  action_items: z.array(z.object({
    task: z.string(),
    owner_user_id: z.string().nullable(),
    owner_name: z.string().nullable(),
    due_date: z.string().nullable(),
    priority: z.enum(["high", "medium", "low"]),
    blocks: z.string().nullable(),
    project_link: z.string().nullable(),
  }).strict()),
  risks_flagged: z.array(z.object({
    risk: z.string(),
    severity: z.enum(["high", "medium", "low"]),
    mitigation: z.string().nullable(),
  }).strict()),
  open_questions: z.array(z.object({
    question: z.string(),
    asked_by: z.string().nullable(),
    directed_to: z.string().nullable(),
  }).strict()),
  blockers: z.array(z.object({
    item: z.string(),
    waiting_on: z.string().nullable(),
    since_when: z.string().nullable(),
  }).strict()),
  budget_impact: z.object({
    mentioned_figures: z.array(z.string()),
    variance_from_plan: z.string().nullable(),
  }).strict().nullable(),
  deadline_impact: z.object({
    dates_mentioned: z.array(z.string()),
    slippage_detected: z.string().nullable(),
  }).strict().nullable(),
  since_last_meeting: z.string().nullable(),
  key_quotes: z.array(z.object({
    speaker: z.string(),
    quote: z.string(),
    timestamp: z.string().nullable(),
  }).strict()),
  topics_covered: z.array(z.object({
    topic: z.string(),
    participants: z.array(z.string()),
  }).strict()),
  sentiment_signals: z.array(z.string()),
  attendance: z.object({
    present: z.array(z.string()),
    absent: z.array(z.string()),
    left_early: z.array(z.string()),
  }).strict(),
  follow_ups_suggested: z.array(z.object({
    type: z.enum(["calendar", "thread_post", "sheet_update"]),
    payload: z.string(),
  }).strict()),
  language: z.string(),
  user_ids: z.array(z.string()),
  project_ids: z.array(z.string()),
  phases: z.array(z.string()),
  dates: z.array(z.string()),
}).strict();

export type SimpleSummary = z.infer<typeof simpleSummarySchema>;
export type DetailedSummary = z.infer<typeof detailedSummarySchema>;

export type AnySummary = SimpleSummary | DetailedSummary;

interface SummaryDependencies {
  client?: OpenAI;
  loadCall?: typeof loadCallMetadata;
  resolve?: typeof resolveGrounding;
}

function toOpenAIJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const jsonSchema = { ...z.toJSONSchema(schema) } as Record<string, unknown>;
  delete jsonSchema.$schema;
  return jsonSchema;
}

const simpleSummaryJsonSchema = toOpenAIJsonSchema(simpleSummarySchema);
const detailedSummaryJsonSchema = toOpenAIJsonSchema(detailedSummarySchema);

// ── Context loader ─────────────────────────────────────────

async function loadCallMetadata(callId: string) {
  const call = await prisma.call.findUnique({
    where: { id: callId },
    select: {
      id: true,
      title: true,
      startedBy: true,
      projectId: true,
      createdAt: true,
      endedAt: true,
      participants: {
        select: { userId: true },
      },
    },
  });
  if (!call) throw new Error("Call not found");

  return call;
}

// ── Prompts ────────────────────────────────────────────────

const SIMPLE_SYSTEM = `You are a professional meeting summarizer in the style of Read AI.
Given a transcript, produce a concise, neutral summary.

Return ONLY valid JSON matching this shape (no markdown, no prose wrapper):
{
  "mode": "simple",
  "executive_summary": "2-3 sentence TL;DR",
  "key_points": ["bullet 1", ...],
  "action_items": [{"task": "...", "owner": "Name or null", "due_date": "ISO or null"}],
  "topics": ["topic 1", ...],
  "next_steps": ["step 1", ...],
  "attendance": {"present": ["Name", ...]},
  "language": "ISO 639-1 code of the transcript",
  "user_ids": ["resolved user ID for every DBS user named in the summary"],
  "project_ids": ["resolved project ID for every project named in the summary"],
  "phases": ["canonical resolved phase used in the summary"],
  "dates": ["resolved ISO date used in the summary"]
}

Rules:
- Auto-detect transcript language. Write the summary IN THAT SAME LANGUAGE.
- Extract owners only when clearly assigned. Otherwise null.
- Extract dates only when explicit. Otherwise null.
- Keep under 10 key points, 10 action items.`;

const DETAILED_SYSTEM = `You are DBS-Architectes' meeting intelligence engine.
You have deep context about the organisation: the project catalog, team roster, prior thread decisions, and rolling project memory.
Produce a DETAILED structured summary that exceeds Read-AI quality by grounding everything in DBS context.

Return ONLY valid JSON matching this exact shape (no markdown, no prose wrapper):
{
  "mode": "detailed",
  "executive_summary": "3-sentence TL;DR referencing project code/phase if known",
  "narrative": "flowing 1-2 paragraph recap, not bullets",
  "decisions_made": [{"what": "...", "who_decided": "Name or null", "who_decided_user_id": "resolved user ID or null", "confidence": "high|medium|low", "conflicts_with_prior": "description or null"}],
  "action_items": [{"task": "...", "owner_user_id": "id from team roster or null", "owner_name": "Name or null", "due_date": "ISO or null", "priority": "high|medium|low", "blocks": "other item or null", "project_link": "project code or null"}],
  "risks_flagged": [{"risk": "...", "severity": "high|medium|low", "mitigation": "... or null"}],
  "open_questions": [{"question": "...", "asked_by": "Name or null", "directed_to": "Name or null"}],
  "blockers": [{"item": "...", "waiting_on": "... or null", "since_when": "... or null"}],
  "budget_impact": {"mentioned_figures": ["CHF 50k", ...], "variance_from_plan": "... or null"} OR null,
  "deadline_impact": {"dates_mentioned": ["2026-05-01", ...], "slippage_detected": "... or null"} OR null,
  "since_last_meeting": "delta vs prior summary (if any) or null",
  "key_quotes": [{"speaker": "Name", "quote": "...", "timestamp": "ISO or null"}],
  "topics_covered": [{"topic": "...", "participants": ["Name", ...]}],
  "sentiment_signals": ["e.g. 'alignment on timeline', 'frustration about permit delay'"],
  "attendance": {"present": ["Name"], "absent": ["Name from project team not present"], "left_early": []},
  "follow_ups_suggested": [{"type": "calendar|thread_post|sheet_update", "payload": "concrete description"}],
  "language": "ISO 639-1 of transcript",
  "user_ids": ["resolved user ID for every DBS user named in the summary"],
  "project_ids": ["resolved project ID for every project named in the summary"],
  "phases": ["canonical resolved phase used in the summary"],
  "dates": ["resolved ISO date used in the summary"]
}

Grounding rules:
- Auto-detect transcript language. Write ALL summary text in that language.
- When a speaker says a name → match to team roster provided and use that user_id. Set who_decided_user_id only for an exact resolved match; otherwise null.
- When a project is mentioned → use its exact resolved code in project_link.
- When a decision contradicts prior memory → flag in conflicts_with_prior.
- Swiss architecture vocabulary: SIA 102/103 phases, permits (PC/DP), drawings — preserve exact terms.
- Never invent owners/dates/figures not present in transcript.
- Confidence reflects transcript clarity + whether speaker has authority for that decision.
- Only mark someone absent when their absence is explicit in the transcript or meeting metadata; never infer absence from the workspace roster.
- If transcript is short/unclear, return the structure anyway with nulls/empty arrays.`;

// ── OpenAI call ────────────────────────────────────────────

function buildContextBlock(
  ctx: {
    call: Awaited<ReturnType<typeof loadCallMetadata>>;
  },
  resolved: ResolvedContext,
) {
  const { call } = ctx;
  const usersById = new Map(resolved.users.map((user) => [user.id, user]));
  const starter = usersById.get(call.startedBy);
  const linkedProject = call.projectId
    ? resolved.projects.find((project) => project.id === call.projectId)
    : undefined;
  const participants = call.participants
    .map((participant) => usersById.get(participant.userId))
    .filter((user) => user !== undefined)
    .map((user) => user.name);

  return [
    `## Resolved grounding context\n${serialiseResolvedContext(resolved)}`,
    linkedProject
      ? `## Linked project\nCode: ${linkedProject.code}\nTitle: ${linkedProject.title}\nPhase: ${linkedProject.phase}\nClient: ${linkedProject.client ?? "—"}\nLocation: ${linkedProject.commune ?? "—"}`
      : `## Linked project\n${call.projectId ? "unresolved" : "standalone meeting"}`,
    `## Meeting metadata\nTitle: ${call.title ?? "Untitled"}\nStarted by: ${starter?.name ?? "unresolved"}\nDuration: ${call.endedAt ? Math.round((+new Date(call.endedAt) - +new Date(call.createdAt)) / 60000) + " min" : "active"}\nParticipants: ${participants.join(", ") || "none resolved"}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

export async function generateSummary(
  callId: string,
  mode: SummaryMode,
  transcript: string,
  subject: GroundingSubject,
  dependencies: SummaryDependencies = {},
): Promise<{ summary: AnySummary; canUpdateProjectMemory: boolean }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!dependencies.client && !apiKey) throw new AiProviderFailure("unavailable");

  const openai = dependencies.client ?? new OpenAI({ apiKey });
  const call = await (dependencies.loadCall ?? loadCallMetadata)(callId);
  const resolved = await (dependencies.resolve ?? resolveGrounding)(buildMeetingSummaryGroundingContract({
    subject,
    input: transcript,
    mode,
    projectId: call.projectId,
  }));
  const linkedProjectIsGrounded = Boolean(
    call.projectId && resolved.projects.some((project) => project.id === call.projectId),
  );
  const system = mode === "detailed" ? DETAILED_SYSTEM : SIMPLE_SYSTEM;
  const contextBlock = buildContextBlock({ call }, resolved);

  const user = [
    contextBlock && `# DBS Organisational Context\n${contextBlock}`,
    `# Transcript\n${transcript.slice(0, 60000)}`,
  ]
    .filter(Boolean)
    .join("\n\n---\n\n");

  const completion = await createOpenAIStructuredCompletion(openai, {
    max_tokens: mode === "detailed" ? 4000 : 1500,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  }, {
    model: "gpt-4o-mini",
    temperature: 0.2,
    schemaName: mode === "detailed" ? "meeting_summary_detailed" : "meeting_summary_simple",
    schema: mode === "detailed" ? detailedSummaryJsonSchema : simpleSummaryJsonSchema,
  });

  const raw = completion.choices[0]?.message?.content?.trim();
  const parsed: AnySummary = parseStructuredOutput(raw, (value) => (
    mode === "detailed"
      ? detailedSummarySchema.parse(value)
      : simpleSummarySchema.parse(value)
  ));
  const validation = validateGrounding(parsed, resolved, { mode: "strip" });

  if (validation.issues.length > 0) {
    console.warn("Meeting summary grounding issues", { callId, issues: validation.issues });
  }
  if (!validation.valid) {
    throw new AiProviderFailure("invalid_output");
  }
  return {
    summary: validation.output,
    canUpdateProjectMemory: linkedProjectIsGrounded,
  };
}

// ── Persistence ────────────────────────────────────────────

export function newShareToken(): string {
  return randomBytes(18).toString("base64url");
}

export async function updateProjectMemory(
  projectId: string,
  summary: DetailedSummary
): Promise<void> {
  const existing = await prisma.projectMeetingMemory.findUnique({ where: { projectId } });

  const newDecisions = (summary.decisions_made || []).map((d) => ({
    what: d.what,
    // Only a validator-checked ID may become a future grounding fact.
    who: d.who_decided_user_id,
    at: new Date().toISOString(),
  }));

  const openItems = [
    ...(summary.open_questions || []).map((q) => ({ type: "question", text: q.question })),
    ...(summary.blockers || []).map((b) => ({ type: "blocker", text: b.item })),
  ];

  const prevCondensed = existing?.condensed ?? "";
  const condensed = [
    prevCondensed,
    `\n--- ${new Date().toISOString().slice(0, 10)} ---`,
    summary.executive_summary,
  ]
    .filter(Boolean)
    .join("\n")
    .slice(-8000); // cap size

  const mergedDecisions = [
    ...((existing?.keyDecisions as Array<Record<string, unknown>> | null) ?? []),
    ...newDecisions,
  ].slice(-50);

  if (existing) {
    await prisma.projectMeetingMemory.update({
      where: { projectId },
      data: {
        condensed,
        keyDecisions: mergedDecisions as never,
        openItems: openItems as never,
      },
    });
  } else {
    await prisma.projectMeetingMemory.create({
      data: {
        projectId,
        condensed,
        keyDecisions: newDecisions as never,
        openItems: openItems as never,
      },
    });
  }
}
