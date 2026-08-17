/**
 * POST /api/support/report — user-submitted problem or question.
 *
 * Authenticated only: an unauthenticated endpoint that sends mail is a spam
 * relay. The reporter's identity comes from the session, never the body, so
 * a report cannot be attributed to someone else.
 */

import { NextRequest } from "next/server";
import { auth } from "@/platform/auth";
import { prisma } from "@/platform/db";
import { clientIp, rateLimit, rateLimitedResponse } from "@/platform/auth/rate-limit";
import {
  sendSupportReport,
  type ReportKind,
} from "@/features/support/server/send-support-report";
import type { EmailAttachment } from "@/platform/email/send";

/** Caps. Screenshots are the expected attachment; these are generous for
 *  that and far below what would choke an SMTP send. */
const MAX_FILES = 4;
const MAX_TOTAL_BYTES = 8 * 1024 * 1024;
const MAX_MESSAGE_CHARS = 5000;
const ALLOWED_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "application/pdf",
]);

type IncomingFile = { filename?: unknown; contentType?: unknown; data?: unknown };

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Sending mail on a user's behalf is exactly the endpoint worth throttling.
  const limit = rateLimit(clientIp(req), {
    key: "support-report",
    limit: 5,
    windowMs: 10 * 60 * 1000,
  });
  if (!limit.allowed) {
    return rateLimitedResponse(
      limit.retryAfterMs,
      "You have sent several reports already. Please wait a few minutes.",
    );
  }

  const body = (await req.json().catch(() => null)) as {
    kind?: unknown;
    message?: unknown;
    pageUrl?: unknown;
    files?: unknown;
  } | null;

  if (!body || typeof body.message !== "string" || body.message.trim() === "") {
    return Response.json({ error: "Please describe the issue." }, { status: 400 });
  }
  if (body.message.length > MAX_MESSAGE_CHARS) {
    return Response.json(
      { error: `Please keep the description under ${MAX_MESSAGE_CHARS} characters.` },
      { status: 400 },
    );
  }

  const kind: ReportKind = body.kind === "question" ? "question" : "problem";

  const rawFiles = Array.isArray(body.files) ? (body.files as IncomingFile[]) : [];
  if (rawFiles.length > MAX_FILES) {
    return Response.json(
      { error: `Please attach at most ${MAX_FILES} files.` },
      { status: 400 },
    );
  }

  const attachments: EmailAttachment[] = [];
  let totalBytes = 0;

  for (const f of rawFiles) {
    if (
      typeof f.filename !== "string" ||
      typeof f.contentType !== "string" ||
      typeof f.data !== "string"
    ) {
      return Response.json({ error: "An attachment was malformed." }, { status: 400 });
    }
    if (!ALLOWED_TYPES.has(f.contentType)) {
      return Response.json(
        { error: `${f.filename} is not a supported file type.` },
        { status: 400 },
      );
    }
    // The client strips the data: prefix, but never trust that it did.
    const base64 = f.data.includes(",") ? f.data.slice(f.data.indexOf(",") + 1) : f.data;
    // Base64 encodes 3 bytes as 4 characters — close enough to size-check
    // without decoding the whole payload into memory first.
    totalBytes += Math.floor((base64.length * 3) / 4);
    if (totalBytes > MAX_TOTAL_BYTES) {
      return Response.json(
        { error: "Attachments are too large. Please keep the total under 8 MB." },
        { status: 400 },
      );
    }
    attachments.push({
      // Strip any path component — a filename is not a path.
      filename: f.filename.split(/[\\/]/).pop() ?? "attachment",
      content: base64,
      contentType: f.contentType,
    });
  }

  // Role comes from the DB, not the JWT, matching loadSubject's reasoning.
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, name: true, email: true, role: true },
  });
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await sendSupportReport({
    kind,
    message: body.message,
    pageUrl: typeof body.pageUrl === "string" ? body.pageUrl : "unknown",
    userAgent: req.headers.get("user-agent") ?? "unknown",
    reporter: user,
    attachments,
  });

  if (!result.ok) {
    // Explicit failure, not a silent swallow — a user who thinks they
    // reported a problem and did not is worse off than one who knows.
    return Response.json(
      { error: "Could not send the report. Please email us directly." },
      { status: 502 },
    );
  }

  return Response.json({ ok: true, deliveredVia: result.deliveredVia });
}
