import { NextRequest } from "next/server";
import { authorize, loadSubject } from "@/platform/authz";
import { prisma } from "@/platform/db";
import { channelAccessWhere } from "@/features/chat/server/channel-access";
import {
  canServeUploadInline,
  MAX_UPLOAD_BYTES,
  readStoredUpload,
  UploadValidationError,
} from "@/platform/integrations/uploads";
import { fridayFileUrl } from "@/platform/integrations/upload-receipt";

export const dynamic = "force-dynamic";

/** Serve a stored upload only after resolving its owning AI session or chat. */
export async function GET(request: NextRequest) {
  const subject = await loadSubject();
  if (!subject) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const key = new URL(request.url).searchParams.get("key") ?? "";
  let fileUrl: string;
  try {
    fileUrl = fridayFileUrl(key);
  } catch {
    return Response.json({ error: "Invalid file key" }, { status: 400 });
  }

  const viewer = {
    userId: subject.userId,
    isExternal: subject.isExternal,
  };
  const aiDecision = authorize(subject, "ai:invoke", { kind: "ai" });
  const chatDecision = authorize(subject, "chat:read", null);
  if (!aiDecision.allow && !chatDecision.allow) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  const [aiAttachment, authorisedMessage] = await Promise.all([
    aiDecision.allow
      ? prisma.aiChatAttachment.findFirst({
          where: { url: fileUrl, userId: subject.userId },
          select: { filename: true, contentType: true },
        })
      : Promise.resolve(null),
    chatDecision.allow
      ? prisma.message.findFirst({
          where: {
            fileUrl,
            deletedAt: null,
            channel: channelAccessWhere(viewer),
          },
          select: { channelId: true, fileName: true },
        })
      : Promise.resolve(null),
  ]);

  if (!aiAttachment && !authorisedMessage) {
    // Do not reveal whether the key exists to an unauthorised caller.
    return Response.json({ error: "File not found" }, { status: 404 });
  }

  try {
    const stored = await readStoredUpload(key, { maxBytes: MAX_UPLOAD_BYTES });
    const filename = aiAttachment?.filename ?? authorisedMessage?.fileName ?? "download";
    const declaredContentType =
      aiAttachment?.contentType ?? stored.contentType ?? "application/octet-stream";
    const inline = canServeUploadInline(filename, declaredContentType);
    const responseBytes = new ArrayBuffer(stored.bytes.byteLength);
    new Uint8Array(responseBytes).set(stored.bytes);
    return new Response(responseBytes, {
      headers: {
        "Content-Type": inline ? declaredContentType : "application/octet-stream",
        "Content-Length": String(stored.bytes.byteLength),
        "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${safeHeaderFilename(filename)}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof UploadValidationError) {
      return Response.json({ error: error.userMessage }, { status: 413 });
    }
    const storageError = error as NodeJS.ErrnoException & {
      name?: string;
      $metadata?: { httpStatusCode?: number };
    };
    if (
      storageError.code === "ENOENT" ||
      storageError.name === "NoSuchKey" ||
      storageError.$metadata?.httpStatusCode === 404
    ) {
      return Response.json({ error: "File not found" }, { status: 404 });
    }
    throw error;
  }
}

function safeHeaderFilename(filename: string): string {
  return filename
    .replace(/[^\x20-\x7e]/g, "_")
    .replace(/["\\/]/g, "_")
    .slice(0, 200);
}
