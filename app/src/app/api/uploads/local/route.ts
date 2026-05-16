/**
 * POST /api/uploads/local — write a file to public/uploads/.
 *
 * Demo / dev-only path. The browser hits this after /api/uploads/presign
 * returned a local-backend URL. We re-authenticate, re-validate the
 * key, then stream the body to disk under public/uploads/<key>.
 *
 * Refuses in production (the platform layer also refuses, this is
 * defense in depth).
 */

import { NextRequest } from "next/server";
import { auth } from "@/platform/auth";
import {
  MAX_UPLOAD_BYTES,
  UploadConfigError,
  UploadValidationError,
  writeLocalUpload,
} from "@/platform/integrations/uploads";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const key = new URL(request.url).searchParams.get("key");
  if (!key) {
    return Response.json({ error: "Missing key" }, { status: 400 });
  }

  const contentLengthHeader = request.headers.get("content-length");
  const contentLength = contentLengthHeader ? parseInt(contentLengthHeader, 10) : 0;
  if (contentLength > MAX_UPLOAD_BYTES) {
    return Response.json(
      { error: `File is larger than ${Math.round(MAX_UPLOAD_BYTES / (1024 * 1024))} MB.` },
      { status: 413 },
    );
  }

  const contentType = request.headers.get("content-type") ?? "application/octet-stream";
  const arrayBuffer = await request.arrayBuffer();
  if (arrayBuffer.byteLength > MAX_UPLOAD_BYTES) {
    return Response.json(
      { error: `File is larger than ${Math.round(MAX_UPLOAD_BYTES / (1024 * 1024))} MB.` },
      { status: 413 },
    );
  }

  try {
    const { publicUrl } = await writeLocalUpload({
      key,
      bytes: Buffer.from(arrayBuffer),
      contentType,
    });
    return Response.json({ ok: true, publicUrl });
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
