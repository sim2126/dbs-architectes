import { NextRequest } from "next/server";
import { auth } from "@/platform/auth";
import { prisma } from "@/platform/db";
import {
  generateSummary,
  loadCallContext,
  newShareToken,
  updateProjectMemory,
  type SummaryMode,
  type DetailedSummary,
} from "@/platform/integrations/meeting-summarizer";
import {
  getRoomTranscripts,
  fetchTranscriptText,
  getRoomRecordings,
  getRecordingAccessLink,
} from "@/platform/integrations/daily";
import { aiDisabledResponse, isAiDisabled } from "@/features/ai/domain/ai-flags";
import { pendoTrack } from "@/platform/integrations/pendo";

export const maxDuration = 120;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (isAiDisabled()) return aiDisabledResponse();

  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    mode?: SummaryMode;
    transcriptOverride?: string;
  };
  const mode: SummaryMode = body.mode === "detailed" ? "detailed" : "simple";

  const call = await prisma.call.findUnique({ where: { id } });
  if (!call) return Response.json({ error: "Call not found" }, { status: 404 });

  // Resolve transcript: manual override → cached → Daily API
  let transcript = body.transcriptOverride ?? call.transcriptText ?? "";
  let transcriptId = call.transcriptId;

  if (!transcript) {
    try {
      const transcripts = await getRoomTranscripts(call.roomName);
      const latest = transcripts[0];
      if (latest?.transcriptId) {
        transcriptId = latest.transcriptId;
        const txt = await fetchTranscriptText(latest.transcriptId);
        if (txt) transcript = txt;
      }
    } catch {
      // ignore — will surface below
    }
  }

  if (!transcript?.trim()) {
    await prisma.call.update({
      where: { id },
      data: { summaryError: "No transcript available — Daily transcription may still be processing." },
    });
    return Response.json(
      { error: "No transcript available yet. Transcription can take up to 5 minutes after call ends." },
      { status: 409 }
    );
  }

  // Fetch recording URL (non-blocking best-effort)
  let recordingUrl = call.recordingUrl;
  if (!recordingUrl) {
    try {
      const recs = await getRoomRecordings(call.roomName);
      const latest = recs[0];
      if (latest?.id) {
        recordingUrl = (await getRecordingAccessLink(latest.id)) ?? null;
      }
    } catch {
      // ignore
    }
  }

  try {
    const summary = await generateSummary(id, mode, transcript);
    const shareToken = call.shareToken ?? newShareToken();

    await prisma.call.update({
      where: { id },
      data: {
        transcriptId,
        transcriptText: transcript,
        recordingUrl,
        summaryMode: mode,
        summary: summary as never,
        shareToken,
        summarizedAt: new Date(),
        summaryError: null,
        detectedLang: summary.language ?? null,
      },
    });

    pendoTrack("call_summary_generated", {
      visitorId: session.user.id,
      properties: {
        callId: id,
        summaryMode: mode,
        hasProjectId: !!call.projectId,
        transcriptLength: transcript.length,
        detectedLang: summary.language ?? undefined,
      },
    });

    // Roll project memory forward on detailed summaries
    if (mode === "detailed" && call.projectId) {
      try {
        await updateProjectMemory(call.projectId, summary as DetailedSummary);
      } catch {
        // non-fatal
      }
    }

    return Response.json({ summary, shareToken });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Summarization failed";
    await prisma.call.update({
      where: { id },
      data: { summaryError: msg },
    });
    return Response.json({ error: msg }, { status: 500 });
  }
}

// GET — retrieve cached summary for the call
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const call = await prisma.call.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      summary: true,
      summaryMode: true,
      summarizedAt: true,
      shareToken: true,
      recordingUrl: true,
      summaryError: true,
      detectedLang: true,
    },
  });
  if (!call) return Response.json({ error: "Not found" }, { status: 404 });

  return Response.json(call);
}

// Unused import guard
void loadCallContext;
