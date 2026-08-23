/**
 * POST /api/uploads/presign — mint a presigned upload URL.
 *
 * Body: { filename, contentType, contentLength }.
 *
 * Returns the shape expected by the chat composer (and any other
 * future surface that needs to drop a blob into S3). The adapter
 * picks S3 or the local-disk fallback based on env config.
 */

import { NextRequest } from "next/server";
import { authorize, loadSubject } from "@/platform/authz";
import { clientIp, rateLimit, rateLimitedResponse } from "@/platform/auth/rate-limit";
import { resolveChannelAccess } from "@/features/chat/server/channel-access";
import { prisma } from "@/platform/db";
import {
  presignUpload,
  UploadConfigError,
  UploadValidationError,
} from "@/platform/integrations/uploads";
import { issueUploadReceipt } from "@/platform/integrations/upload-receipt";
import { isIngestibleUpload } from "@/features/ai/domain/attachments";

export async function POST(request: NextRequest) {
  const subject = await loadSubject();
  if (!subject) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const uploadLimit = rateLimit(`${subject.userId}:${clientIp(request)}`, {
    key: "upload-presign",
    limit: 20,
    windowMs: 10 * 60 * 1000,
  });
  if (!uploadLimit.allowed) {
    return rateLimitedResponse(
      uploadLimit.retryAfterMs,
      "Too many uploads. Please wait before attaching another file.",
    );
  }

  const body = (await request.json().catch(() => null)) as {
    filename?: string;
    contentType?: string;
    contentLength?: number;
    purpose?: "chat" | "ai";
    targetId?: string;
  } | null;

  if (
    !body ||
    typeof body.filename !== "string" ||
    typeof body.contentType !== "string" ||
    typeof body.contentLength !== "number" ||
    (body.purpose !== "chat" && body.purpose !== "ai") ||
    typeof body.targetId !== "string" ||
    !body.targetId
  ) {
    return Response.json(
      { error: "filename, contentType, contentLength, purpose and targetId are required" },
      { status: 400 },
    );
  }

  if (body.purpose === "chat") {
    const readDecision = authorize(subject, "chat:read", null);
    if (!readDecision.allow) {
      return Response.json({ error: readDecision.reason }, { status: 403 });
    }
    const postDecision = authorize(subject, "chat:post", null);
    if (!postDecision.allow) {
      return Response.json({ error: postDecision.reason }, { status: 403 });
    }
    const access = await resolveChannelAccess(body.targetId, subject);
    if (!access.ok) return Response.json({ error: access.error }, { status: access.status });
  } else {
    const aiDecision = authorize(subject, "ai:invoke", { kind: "ai" });
    if (!aiDecision.allow) {
      return Response.json({ error: aiDecision.reason }, { status: 403 });
    }
    const ownedSession = await prisma.aiChatSession.findFirst({
      where: { id: body.targetId, userId: subject.userId },
      select: { id: true },
    });
    if (!ownedSession) {
      return Response.json({ error: "Conversation not found." }, { status: 404 });
    }
    if (!isIngestibleUpload(body.filename, body.contentType)) {
      return Response.json(
        { error: "AI Assistant cannot read this file type." },
        { status: 400 },
      );
    }
  }

  const origin = new URL(request.url).origin;

  try {
    const presigned = await presignUpload(
      {
        filename: body.filename,
        contentType: body.contentType,
        contentLength: body.contentLength,
      },
      { origin },
    );
    const receipt = issueUploadReceipt({
      userId: subject.userId,
      finalUrl: presigned.finalUrl,
      filename: body.filename,
      contentType: body.contentType,
      sizeBytes: body.contentLength,
      backend: presigned.backend,
      purpose: body.purpose,
      targetId: body.targetId,
      expiresAt: new Date(presigned.expiresAt).getTime(),
    });
    return Response.json({
      ...presigned,
      headers:
        presigned.backend === "local"
          ? { ...presigned.headers, "X-Friday-Upload-Receipt": receipt }
          : presigned.headers,
      receipt,
    });
  } catch (err) {
    if (err instanceof UploadValidationError) {
      return Response.json({ error: err.userMessage }, { status: 400 });
    }
    if (err instanceof UploadConfigError) {
      return Response.json({ error: err.message }, { status: 503 });
    }
    throw err;
  }
}
