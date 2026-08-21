/**
 * /api/ai-attachments — files attached in DBS GPT.
 *
 * GET  list the caller's attachments, newest first
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
import { auth } from "@/platform/auth";
import { prisma } from "@/platform/db";
import { INGESTIBLE_TYPES, isIngestibleType } from "@/features/ai/domain/attachments";

const MAX_BYTES = 25 * 1024 * 1024;

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get("sessionId");

  const attachments = await prisma.aiChatAttachment.findMany({
    where: {
      userId: session.user.id,
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

  return Response.json({ attachments });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as {
    filename?: unknown;
    contentType?: unknown;
    sizeBytes?: unknown;
    url?: unknown;
    sessionId?: unknown;
  } | null;

  if (
    !body ||
    typeof body.filename !== "string" ||
    typeof body.contentType !== "string" ||
    typeof body.url !== "string" ||
    typeof body.sizeBytes !== "number"
  ) {
    return Response.json(
      { error: "filename, contentType, sizeBytes and url are required." },
      { status: 400 },
    );
  }

  if (!isIngestibleType(body.contentType)) {
    return Response.json(
      {
        error:
          `${body.filename} is not a supported type. ` +
          `Accepted: PDF, images, CSV and Excel.`,
      },
      { status: 400 },
    );
  }

  if (body.sizeBytes <= 0 || body.sizeBytes > MAX_BYTES) {
    return Response.json(
      { error: "Files must be under 25 MB." },
      { status: 400 },
    );
  }

  const attachment = await prisma.aiChatAttachment.create({
    data: {
      userId: session.user.id,
      sessionId: typeof body.sessionId === "string" ? body.sessionId : null,
      // Strip any path component — a filename is not a path.
      filename: body.filename.split(/[\\/]/).pop() ?? "attachment",
      contentType: body.contentType,
      sizeBytes: Math.round(body.sizeBytes),
      url: body.url,
      // ingestedAt stays null. The file is stored; nothing has read it yet,
      // and claiming otherwise is how a user gets a confident answer about a
      // document the model never saw.
    },
    select: { id: true, filename: true, createdAt: true },
  });

  return Response.json({ attachment, accepted: INGESTIBLE_TYPES.length });
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) {
    return Response.json({ error: "id is required." }, { status: 400 });
  }

  // deleteMany with the user filter, not delete by id — a delete by id alone
  // would let one user remove another's row.
  const { count } = await prisma.aiChatAttachment.deleteMany({
    where: { id, userId: session.user.id },
  });
  if (count === 0) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }

  // The stored object is deliberately left in place. Orphaning a blob is
  // cheaper and safer than deleting one that another record may reference,
  // and storage cleanup belongs in a sweep with its own audit trail.
  return Response.json({ ok: true });
}
