/**
 * /api/ai-attachments — files attached in DBS AI.
 *
 * GET  list the caller's attachments, newest first, or one in full via ?id=
 * POST record one that has already been uploaded
 *
 * The bytes do not pass through here. The client presigns via
 * /api/uploads/presign, uploads directly to storage, then posts the resulting
 * location. Routing megabytes through a serverless function to write a row is
 * a waste of a request and a hard ceiling on file size.
 *
 * Scoped to the caller by construction — every query filters on the session
 * user, so there is no way to read or write another person's attachments.
 */

import { NextRequest } from "next/server";
import { prisma } from "@/platform/db";
import { requireAiAccess } from "@/platform/ai/access";
import {
  INGESTIBLE_TYPES,
  isIngestibleUpload,
  visibleIngestError,
} from "@/features/ai/domain/attachments";
import {
  MAX_UPLOAD_BYTES,
  UploadValidationError,
  deleteStoredUpload,
  verifyStoredUpload,
} from "@/platform/integrations/uploads";
import {
  fridayFileUrl,
  objectKeyFromFridayFileUrl,
  UPLOAD_RECEIPT_TTL_MS,
  UploadReceiptError,
  verifyUploadReceipt,
} from "@/platform/integrations/upload-receipt";

export async function GET(req: NextRequest) {
  const access = await requireAiAccess(req);
  if (!access.allowed) return access.response;
  const userId = access.subject.userId;

  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get("sessionId");
  const id = searchParams.get("id");

  // One row, with its extracted text. Separate from the list on purpose: the
  // preview needs the text of the file being opened, and a listing that
  // carried every document's full text would ship megabytes to render a
  // sidebar. Still filtered on the caller, so an id belonging to someone else
  // returns 404 rather than their document.
  if (id) {
    const one = await prisma.aiChatAttachment.findFirst({
      where: { id, userId },
      select: {
        id: true,
        filename: true,
        contentType: true,
        sizeBytes: true,
        url: true,
        sessionId: true,
        ingestedAt: true,
        ingestError: true,
        createdAt: true,
        extractedText: true,
        extractedUnits: true,
      },
    });
    if (!one) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }
    return Response.json({
      attachment: { ...one, ingestError: visibleIngestError(one.ingestError) },
    });
  }

  const attachments = await prisma.aiChatAttachment.findMany({
    where: {
      userId,
      // Absent sessionId lists everything the user has attached; present
      // narrows to one conversation.
      ...(sessionId ? { sessionId } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      id: true,
      filename: true,
      contentType: true,
      sizeBytes: true,
      url: true,
      sessionId: true,
      ingestedAt: true,
      ingestError: true,
      createdAt: true,
    },
  });

  return Response.json({
    attachments: attachments.map((attachment) => ({
      ...attachment,
      ingestError: visibleIngestError(attachment.ingestError),
    })),
  });
}

export async function POST(req: NextRequest) {
  const access = await requireAiAccess(req);
  if (!access.allowed) return access.response;
  const userId = access.subject.userId;

  const body = (await req.json().catch(() => null)) as {
    receipt?: unknown;
    sessionId?: unknown;
  } | null;

  if (!body || typeof body.receipt !== "string") {
    return Response.json(
      { error: "A valid Friday upload receipt is required." },
      { status: 400 },
    );
  }
  const requestedSessionId =
    typeof body.sessionId === "string" && body.sessionId ? body.sessionId : null;
  if (!requestedSessionId) {
    return Response.json(
      { error: "The upload receipt does not belong to this conversation." },
      { status: 400 },
    );
  }

  let upload;
  try {
    upload = verifyUploadReceipt(body.receipt, userId, {
      expectedPurpose: "ai",
      expectedTargetId: requestedSessionId,
    });
  } catch (error) {
    if (error instanceof UploadReceiptError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }

  if (!isIngestibleUpload(upload.filename, upload.contentType)) {
    return Response.json(
      {
        error:
          `${upload.filename} is not a supported type. ` +
          `Accepted: PDF, images, CSV, Excel and Word documents.`,
      },
      { status: 400 },
    );
  }

  if (upload.sizeBytes <= 0 || upload.sizeBytes > MAX_UPLOAD_BYTES) {
    return Response.json(
      {
        error: `Files must be under ${Math.round(MAX_UPLOAD_BYTES / (1024 * 1024))} MB.`,
      },
      { status: 400 },
    );
  }

  const ownedSession = await prisma.aiChatSession.findFirst({
    where: { id: requestedSessionId, userId },
    select: { id: true },
  });
  if (!ownedSession) {
    return Response.json({ error: "Conversation not found." }, { status: 404 });
  }

  try {
    await verifyStoredUpload({
      key: upload.objectKey,
      sizeBytes: upload.sizeBytes,
      contentType: upload.contentType,
    });
  } catch (error) {
    if (error instanceof UploadValidationError) {
      return Response.json({ error: error.userMessage }, { status: 400 });
    }
    throw error;
  }

  const url = fridayFileUrl(upload.objectKey);
  // Storage verification may outlast the five-minute receipt window. Recheck
  // immediately before the write so an expired object cannot gain a new
  // reference while orphan collection is deciding whether it is safe to delete.
  try {
    verifyUploadReceipt(body.receipt, userId, {
      expectedPurpose: "ai",
      expectedTargetId: requestedSessionId,
    });
  } catch (error) {
    if (error instanceof UploadReceiptError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
  const attachment = await prisma.aiChatAttachment.upsert({
    where: { userId_url: { userId, url } },
    update: {},
    create: {
      userId,
      sessionId: requestedSessionId,
      // Strip any path component — a filename is not a path.
      filename: upload.filename.split(/[\\/]/).pop() ?? "attachment",
      contentType: upload.contentType,
      sizeBytes: upload.sizeBytes,
      url,
      // ingestedAt stays null. The file is stored; nothing has read it yet,
      // and claiming otherwise is how a user gets a confident answer about a
      // document the model never saw.
    },
    select: { id: true, filename: true, createdAt: true },
  });

  return Response.json({ attachment, accepted: INGESTIBLE_TYPES.length });
}

export async function DELETE(req: NextRequest) {
  const access = await requireAiAccess(req);
  if (!access.allowed) return access.response;
  const userId = access.subject.userId;

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) {
    return Response.json({ error: "id is required." }, { status: 400 });
  }

  // Scope the lookup to the caller before deleting by primary key.
  const attachment = await prisma.aiChatAttachment.findFirst({
    where: { id, userId },
    select: { id: true, url: true, createdAt: true },
  });
  if (!attachment) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }

  // Old objects are beyond their receipt replay window, so a reference check
  // can safely collect them. Fresher objects remain for the scheduled orphan
  // collector once the receipt grace period has elapsed.
  await prisma.aiChatAttachment.delete({ where: { id: attachment.id } });

  const safeToCollect =
    Date.now() - attachment.createdAt.getTime() > UPLOAD_RECEIPT_TTL_MS + 30_000;
  if (safeToCollect) {
    const [aiReferences, messageReferences] = await Promise.all([
      prisma.aiChatAttachment.count({ where: { url: attachment.url } }),
      prisma.message.count({ where: { fileUrl: attachment.url } }),
    ]);
    if (aiReferences === 0 && messageReferences === 0) {
      try {
        await deleteStoredUpload(objectKeyFromFridayFileUrl(attachment.url));
        return Response.json({ ok: true, storageCleanup: "complete" });
      } catch {
        // The DB deletion is authoritative. The scheduled collector retries
        // storage cleanup without turning a successful user action into a 500.
      }
    }
  }

  return Response.json({ ok: true, storageCleanup: "queued" });
}
