/** POST /api/ai-attachments/ingest — claim and read the caller's files. */

import { NextRequest } from "next/server";
import { prisma } from "@/platform/db";
import { requireAiAccess } from "@/platform/ai/access";
import { clientIp, rateLimit, rateLimitedResponse } from "@/platform/auth/rate-limit";
import {
  INGEST_PROCESSING_PREFIX,
  isIngestProcessing,
} from "@/features/ai/domain/attachments";
import {
  ExtractError,
  extractText,
  validateAttachmentBytes,
} from "@/features/ai/server/ingest/extract";
import {
  MAX_UPLOAD_BYTES,
  readStoredUpload,
} from "@/platform/integrations/uploads";
import { objectKeyFromFridayFileUrl } from "@/platform/integrations/upload-receipt";

const BATCH_SIZE = 3;
const CLAIM_STALE_MS = 5 * 60 * 1000;
const READ_TIMEOUT_MS = 30_000;

export async function POST(req: NextRequest) {
  const access = await requireAiAccess(req);
  if (!access.allowed) return access.response;
  const userId = access.subject.userId;

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
  const candidates = await prisma.aiChatAttachment.findMany({
    where: {
      userId,
      ...(singleId ? { id: singleId } : {}),
      ingestedAt: null,
      ...(singleId
        ? {}
        : { OR: [{ ingestError: null }, { ingestError: { startsWith: INGEST_PROCESSING_PREFIX } }] }),
    },
    orderBy: { createdAt: "asc" },
    take: singleId ? 1 : BATCH_SIZE * 4,
    select: {
      id: true,
      filename: true,
      contentType: true,
      sizeBytes: true,
      url: true,
      ingestError: true,
    },
  });

  const pending = candidates
    .filter((candidate) => canClaim(candidate.ingestError, Boolean(singleId)))
    .slice(0, singleId ? 1 : BATCH_SIZE);
  if (pending.length === 0) {
    return Response.json({ processed: 0, remaining: 0, results: [] });
  }

  const results: Array<{ id: string; ok: boolean; reason?: string }> = [];
  for (const attachment of pending) {
    const claim = `${INGEST_PROCESSING_PREFIX}${Date.now()}:${crypto.randomUUID()}`;
    const claimed = await prisma.aiChatAttachment.updateMany({
      where: {
        id: attachment.id,
        userId,
        ingestedAt: null,
        ingestError: attachment.ingestError,
      },
      data: { ingestError: claim },
    });
    if (claimed.count === 0) {
      results.push({
        id: attachment.id,
        ok: false,
        reason: "This file is already being read.",
      });
      continue;
    }

    try {
      const objectKey = objectKeyFromFridayFileUrl(attachment.url);
      const stored = await withTimeout(
        readStoredUpload(objectKey, { maxBytes: MAX_UPLOAD_BYTES }),
        READ_TIMEOUT_MS,
      );
      validateAttachmentBytes({
        bytes: stored.bytes,
        filename: attachment.filename,
        contentType: attachment.contentType,
        expectedBytes: attachment.sizeBytes,
        storedContentType: stored.contentType,
      });
      const { text, units } = await extractText(
        stored.bytes,
        attachment.contentType,
        attachment.filename,
      );

      await prisma.aiChatAttachment.updateMany({
        where: { id: attachment.id, userId, ingestError: claim },
        data: {
          extractedText: text,
          extractedUnits: units,
          ingestedAt: new Date(),
          ingestError: null,
        },
      });
      results.push({ id: attachment.id, ok: true });
    } catch (error) {
      const reason = error instanceof ExtractError
        ? error.message
        : error instanceof IngestTimeoutError
          ? error.message
          : "The stored file could not be read safely.";
      await prisma.aiChatAttachment.updateMany({
        where: { id: attachment.id, userId, ingestError: claim },
        data: { ingestError: reason.slice(0, 500) },
      });
      results.push({ id: attachment.id, ok: false, reason });
    }
  }

  const remaining = await prisma.aiChatAttachment.count({
    where: { userId, ingestedAt: null, ingestError: null },
  });
  return Response.json({ processed: results.length, results, remaining });
}

export function canClaim(ingestError: string | null, explicitRetry: boolean): boolean {
  if (ingestError === null) return true;
  if (!isIngestProcessing(ingestError)) return explicitRetry;
  const claimedAt = Number(ingestError.slice(INGEST_PROCESSING_PREFIX.length).split(":", 1)[0]);
  return Number.isFinite(claimedAt) && Date.now() - claimedAt >= CLAIM_STALE_MS;
}

class IngestTimeoutError extends Error {
  constructor() {
    super("Reading the stored file timed out. Please retry shortly.");
    this.name = "IngestTimeoutError";
  }
}

async function withTimeout<T>(operation: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new IngestTimeoutError()), timeoutMs);
  });
  try {
    return await Promise.race([operation, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
