import { NextRequest } from "next/server";
import { auth } from "@/platform/auth";
import { prisma } from "@/platform/db";
import {
  generateSummary,
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
import { canAccessCall } from "@/features/calls/server/call-access";
import { toSafeAiFailure } from "@/platform/ai/provider";

export const maxDuration = 120;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (isAiDisabled()) return aiDisabledResponse();

  const { id } = await params;
  if (!(await canAccessCall({ callId: id, userId: session.user.id, role: session.user.role }))) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
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
    const generated = await generateSummary(id, mode, transcript, {
      userId: session.user.id,
      role: session.user.role,
    });
    const { summary } = generated;
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
        shareExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        shareRevokedAt: null,
        summarizedAt: new Date(),
        summaryError: null,
        detectedLang: summary.language ?? null,
      },
    });

    // Roll project memory forward on detailed summaries
    if (mode === "detailed" && call.projectId && generated.canUpdateProjectMemory) {
      try {
        await updateProjectMemory(call.projectId, summary as DetailedSummary);
      } catch {
        // non-fatal
      }
    }

    return Response.json({ summary, shareToken });
  } catch (err) {
    const failure = toSafeAiFailure("meeting-summary", err);
    await prisma.call.update({
      where: { id },
      data: { summaryError: failure.message },
    });
    return Response.json({ error: failure.message }, { status: failure.httpStatus });
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
  if (!(await canAccessCall({ callId: id, userId: session.user.id, role: session.user.role }))) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  const call = await prisma.call.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      summary: true,
      summaryMode: true,
      summarizedAt: true,
      shareToken: true,
      shareExpiresAt: true,
      recordingUrl: true,
      summaryError: true,
      detectedLang: true,
    },
  });
  if (!call) return Response.json({ error: "Not found" }, { status: 404 });

  return Response.json(call);
}
