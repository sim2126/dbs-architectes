import OpenAI from "openai";
import { prisma } from "@/lib/db";
import { randomBytes } from "crypto";

// ── Shapes ─────────────────────────────────────────────────

export type SummaryMode = "simple" | "detailed";

export interface SimpleSummary {
  mode: "simple";
  executive_summary: string;
  key_points: string[];
  action_items: Array<{ task: string; owner: string | null; due_date: string | null }>;
  topics: string[];
  next_steps: string[];
  attendance: { present: string[] };
  language: string;
}

export interface DetailedSummary {
  mode: "detailed";
  executive_summary: string;
  narrative: string;
  decisions_made: Array<{
    what: string;
    who_decided: string | null;
    confidence: "high" | "medium" | "low";
    conflicts_with_prior: string | null;
  }>;
  action_items: Array<{
    task: string;
    owner_user_id: string | null;
    owner_name: string | null;
    due_date: string | null;
    priority: "high" | "medium" | "low";
    blocks: string | null;
    project_link: string | null;
  }>;
  risks_flagged: Array<{ risk: string; severity: "high" | "medium" | "low"; mitigation: string | null }>;
  open_questions: Array<{ question: string; asked_by: string | null; directed_to: string | null }>;
  blockers: Array<{ item: string; waiting_on: string | null; since_when: string | null }>;
  budget_impact: { mentioned_figures: string[]; variance_from_plan: string | null } | null;
  deadline_impact: { dates_mentioned: string[]; slippage_detected: string | null } | null;
  since_last_meeting: string | null;
  key_quotes: Array<{ speaker: string; quote: string; timestamp: string | null }>;
  topics_covered: Array<{ topic: string; participants: string[] }>;
  sentiment_signals: string[];
  attendance: { present: string[]; absent: string[]; left_early: string[] };
  follow_ups_suggested: Array<{ type: "calendar" | "thread_post" | "sheet_update"; payload: string }>;
  language: string;
}

export type AnySummary = SimpleSummary | DetailedSummary;

// ── Context loader ─────────────────────────────────────────

export async function loadCallContext(callId: string) {
  const call = await prisma.call.findUnique({
    where: { id: callId },
    include: {
      starter: { select: { id: true, name: true, email: true, initials: true } },
      project: true,
      participants: {
        include: {
          user: { select: { id: true, name: true, email: true, role: true, initials: true } },
        },
      },
    },
  });
  if (!call) throw new Error("Call not found");

  let projectTeam: Array<{ id: string; name: string | null; role: string | null }> = [];
  let threadHistory: Array<{ user: string; content: string; at: string }> = [];
  let priorMemory: { condensed: string; openItems: unknown; keyDecisions: unknown } | null = null;
  let priorSummaries: Array<{ title: string | null; summary: unknown; at: string }> = [];

  if (call.projectId) {
    const assigns = await prisma.projectAssignment.findMany({
      where: { projectId: call.projectId },
      include: { user: { select: { id: true, name: true, role: true } } },
    });
    projectTeam = assigns.map((a) => ({ id: a.user.id, name: a.user.name, role: a.role ?? a.user.role }));

    const channels = await prisma.channel.findMany({
      where: { projectId: call.projectId },
      select: { id: true },
    });
    if (channels.length) {
      const msgs = await prisma.message.findMany({
        where: { channelId: { in: channels.map((c) => c.id) }, deletedAt: null },
        orderBy: { createdAt: "desc" },
        take: 40,
        include: { user: { select: { name: true } } },
      });
      threadHistory = msgs.reverse().map((m) => ({
        user: m.user.name ?? "Unknown",
        content: m.content.slice(0, 300),
        at: m.createdAt.toISOString(),
      }));
    }

    const mem = await prisma.projectMeetingMemory.findUnique({
      where: { projectId: call.projectId },
    });
    if (mem) {
      priorMemory = {
        condensed: mem.condensed,
        openItems: mem.openItems,
        keyDecisions: mem.keyDecisions,
      };
    }

    const priors = await prisma.call.findMany({
      where: {
        projectId: call.projectId,
        id: { not: callId },
        summary: { not: null as never },
      },
      orderBy: { createdAt: "desc" },
      take: 3,
      select: { title: true, summary: true, createdAt: true },
    });
    priorSummaries = priors.map((p) => ({
      title: p.title,
      summary: p.summary,
      at: p.createdAt.toISOString(),
    }));
  }

  return { call, projectTeam, threadHistory, priorMemory, priorSummaries };
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
  "language": "ISO 639-1 code of the transcript"
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
  "decisions_made": [{"what": "...", "who_decided": "Name or null", "confidence": "high|medium|low", "conflicts_with_prior": "description or null"}],
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
  "language": "ISO 639-1 of transcript"
}

Grounding rules:
- Auto-detect transcript language. Write ALL summary text in that language.
- When a speaker says a name → match to team roster provided and use that user_id.
- When a project is mentioned → use its code (e.g. DBS-0042) in project_link.
- When a decision contradicts prior memory → flag in conflicts_with_prior.
- Swiss architecture vocabulary: SIA 102/103 phases, permits (PC/DP), drawings — preserve exact terms.
- Never invent owners/dates/figures not present in transcript.
- Confidence reflects transcript clarity + whether speaker has authority for that decision.
- If transcript is short/unclear, return the structure anyway with nulls/empty arrays.`;

// ── OpenAI call ────────────────────────────────────────────

function buildContextBlock(ctx: Awaited<ReturnType<typeof loadCallContext>>) {
  const { call, projectTeam, threadHistory, priorMemory, priorSummaries } = ctx;
  return [
    call.project
      ? `## Project\nCode: ${call.project.code}\nTitle: ${call.project.title}\nPhase: ${call.project.phase}\nClient: ${call.project.client ?? "—"}\nLocation: ${call.project.commune ?? call.project.address ?? "—"}\nStatus: ${call.project.workStatus}`
      : "## Project\n(standalone meeting, no project link)",
    `## Meeting metadata\nTitle: ${call.title ?? "Untitled"}\nStarted by: ${call.starter.name ?? call.starter.email}\nDuration: ${call.endedAt ? Math.round((+new Date(call.endedAt) - +new Date(call.createdAt)) / 60000) + " min" : "active"}\nParticipants: ${call.participants.map((p) => p.user.name ?? p.user.email).join(", ") || "none recorded"}`,
    projectTeam.length
      ? `## Project team roster (resolve names → user IDs)\n${projectTeam.map((t) => `- ${t.name} [id:${t.id}] (${t.role ?? "member"})`).join("\n")}`
      : "",
    threadHistory.length
      ? `## Recent project thread (last ${threadHistory.length} messages, oldest first)\n${threadHistory.map((m) => `[${m.at.slice(0, 10)}] ${m.user}: ${m.content}`).join("\n")}`
      : "",
    priorMemory
      ? `## Rolling project memory\n${priorMemory.condensed}\n\nKey decisions so far: ${JSON.stringify(priorMemory.keyDecisions ?? [])}\nOpen items: ${JSON.stringify(priorMemory.openItems ?? [])}`
      : "",
    priorSummaries.length
      ? `## Prior meeting summaries (${priorSummaries.length})\n${priorSummaries.map((p, i) => `### ${i + 1}. ${p.title ?? "(untitled)"} — ${p.at.slice(0, 10)}\n${JSON.stringify(p.summary).slice(0, 1500)}`).join("\n\n")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

export async function generateSummary(
  callId: string,
  mode: SummaryMode,
  transcript: string
): Promise<AnySummary> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not configured");

  const openai = new OpenAI({ apiKey });
  const ctx = await loadCallContext(callId);

  const system = mode === "detailed" ? DETAILED_SYSTEM : SIMPLE_SYSTEM;
  const contextBlock = mode === "detailed" ? buildContextBlock(ctx) : "";

  const user = [
    contextBlock && `# DBS Organisational Context\n${contextBlock}`,
    `# Transcript\n${transcript.slice(0, 60000)}`,
  ]
    .filter(Boolean)
    .join("\n\n---\n\n");

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.2,
    max_tokens: mode === "detailed" ? 4000 : 1500,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });

  const raw = completion.choices[0]?.message?.content?.trim();
  if (!raw) throw new Error("Empty summary response");

  const parsed = JSON.parse(raw) as AnySummary;
  parsed.mode = mode;
  return parsed;
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
    who: d.who_decided,
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
