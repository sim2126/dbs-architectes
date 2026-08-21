/**
 * POST /api/ai-attachments/ingest — run extraction over pending attachments.
 *
 * Deliberately a pull, not a push. The upload path records a row and returns
 * immediately; this route picks up whatever has no `ingestedAt` yet. That
 * means an upload never waits on extraction, a failed extraction can be
 * retried by calling this again, and a cold start during upload cannot leave
 * a file permanently unread.
 *
 * Body: { id? } — one attachment, or omit to process the caller's backlog.
 *
 * Scoped to the caller. A user can only ingest their own files, so this
 * cannot be used to make another person's document readable.
 */

import { NextRequest } from "next/server";
import { auth } from "@/platform/auth";
import { prisma } from "@/platform/db";
import { clientIp, rateLimit, rateLimitedResponse } from "@/platform/auth/rate-limit";
import {
  ExtractError,
  extractText,
  MAX_EXTRACTED_CHARS,
} from "@/features/ai/server/ingest/extract";

/** Per call. Extraction can involve a vision request per image, so a large
 *  backlog is processed across several calls rather than one long request
 *  that risks the platform's execution ceiling. */
const BATCH_SIZE = 3;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Extraction costs money per image. Throttled for the same reason the
  // support endpoint is.
  const limit = rateLimit(clientIp(req), {
    key: "ai-ingest",
    limit: 20,
    windowMs: 10 * 60 * 1000,
  });
  if (!limit.allowed) {
    return rateLimitedResponse(
      limit.retryAfterMs,
      "Too many extraction requests. Please wait a moment.",
    );
  }

  const body = (await req.json().catch(() => null)) as { id?: unknown } | null;
  const singleId = typeof body?.id === "string" ? body.id : null;

  const pending = await prisma.aiChatAttachment.findMany({
    where: {
      userId: session.user.id,
      ...(singleId ? { id: singleId } : {}),
      ingestedAt: null,
      // A previous failure is retried only when asked for by id. Otherwise a
      // permanently unreadable file would be re-attempted on every sweep,
      // burning vision calls forever.
      ...(singleId ? {} : { ingestError: null }),
    },
    orderBy: { createdAt: "asc" },
    take: singleId ? 1 : BATCH_SIZE,
    select: { id: true, filename: true, contentType: true, url: true },
  });

  if (pending.length === 0) {
    return Response.json({ processed: 0, remaining: 0 });
  }

  const results: Array<{ id: string; ok: boolean; reason?: string }> = [];

  for (const attachment of pending) {
    try {
      const bytes = await fetchBytes(attachment.url, req);
      const { text, units, truncated } = await extractText(
        bytes,
        attachment.contentType,
        attachment.filename,
      );

      await prisma.aiChatAttachment.update({
        where: { id: attachment.id },
        data: {
          extractedText: text,
          extractedUnits: units,
          ingestedAt: new Date(),
          // Truncation is recorded as a note, not an error — the file IS
          // readable, just not in full, and the user should know which.
          ingestError: truncated
            ? `Read the first ${MAX_EXTRACTED_CHARS.toLocaleString("en-GB")} characters only.`
            : null,
        },
      });
      results.push({ id: attachment.id, ok: true });
    } catch (err) {
      const reason =
        err instanceof ExtractError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Extraction failed.";
      // Recorded on the row, not swallowed. A file that silently never
      // becomes readable is indistinguishable from one still processing.
      await prisma.aiChatAttachment.update({
        where: { id: attachment.id },
        data: { ingestError: reason.slice(0, 500) },
      });
      results.push({ id: attachment.id, ok: false, reason });
    }
  }

  const remaining = await prisma.aiChatAttachment.count({
    where: { userId: session.user.id, ingestedAt: null, ingestError: null },
  });

  return Response.json({ processed: results.length, results, remaining });
}

/**
 * Reads the stored object.
 *
 * Local-disk deployments store a relative path, so it is resolved against
 * this request's origin. Anything absolute is fetched as given — but only
 * over http(s), so a stored value cannot be coerced into reading a local
 * file through a file:// URL.
 */
async function fetchBytes(url: string, req: NextRequest): Promise<Uint8Array> {
  const absolute = url.startsWith("http")
    ? url
    : new URL(url, new URL(req.url).origin).toString();

  const parsed = new URL(absolute);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new ExtractError("Attachment location is not readable.");
  }

  const res = await fetch(absolute);
  if (!res.ok) {
    throw new ExtractError(`Could not fetch the stored file (${res.status}).`);
  }
  return new Uint8Array(await res.arrayBuffer());
}
