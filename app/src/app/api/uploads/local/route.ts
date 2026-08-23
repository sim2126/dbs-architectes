/**
 * POST /api/uploads/local — write a file to private local storage.
 *
 * Demo / dev-only path. The browser hits this after /api/uploads/presign
 * returned a local-backend URL. We re-authenticate, re-validate the
 * receipt-bound key, then write the body below .data/uploads/<key>.
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
import {
  UploadReceiptError,
  verifyUploadReceipt,
} from "@/platform/integrations/upload-receipt";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const session = await auth({ allowExternal: true });
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const key = new URL(request.url).searchParams.get("key");
  if (!key) {
    return Response.json({ error: "Missing key" }, { status: 400 });
  }

  let expectedSize = 0;
  let expectedContentType = "";
  try {
    const receipt = verifyUploadReceipt(
      request.headers.get("x-friday-upload-receipt") ?? "",
      session.user.id,
    );
    if (receipt.backend !== "local" || receipt.objectKey !== key) {
      throw new UploadReceiptError();
    }
    expectedSize = receipt.sizeBytes;
    expectedContentType = receipt.contentType;
  } catch (error) {
    if (error instanceof UploadReceiptError) {
      return Response.json({ error: error.message }, { status: 403 });
    }
    throw error;
  }

  const contentLengthHeader = request.headers.get("content-length");
  const contentLength = contentLengthHeader ? parseInt(contentLengthHeader, 10) : 0;
  if (contentLength > MAX_UPLOAD_BYTES) {
    return Response.json(
      { error: `File is larger than ${Math.round(MAX_UPLOAD_BYTES / (1024 * 1024))} MB.` },
      { status: 413 },
    );
  }
  if (contentLength > 0 && contentLength !== expectedSize) {
    return Response.json({ error: "Upload size does not match its receipt." }, { status: 400 });
  }

  const contentType = request.headers.get("content-type") ?? "application/octet-stream";
  if (contentType.split(";", 1)[0]?.trim().toLowerCase() !== expectedContentType) {
    return Response.json({ error: "Upload content type does not match its receipt." }, { status: 400 });
  }
  let bytes: Buffer;
  try {
    bytes = await readBoundedBody(request, expectedSize);
  } catch (error) {
    if (error instanceof UploadValidationError) {
      return Response.json({ error: error.userMessage }, { status: 400 });
    }
    throw error;
  }

  try {
    const { publicUrl } = await writeLocalUpload({
      key,
      bytes,
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

/**
 * Read at most the signed number of bytes. `arrayBuffer()` would only discover
 * an omitted or dishonest Content-Length after buffering the entire request,
 * which turns the local development endpoint into a memory-exhaustion path.
 */
async function readBoundedBody(request: NextRequest, expectedSize: number): Promise<Buffer> {
  if (!request.body) {
    throw new UploadValidationError("Upload size does not match its receipt.");
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > expectedSize || received > MAX_UPLOAD_BYTES) {
        await reader.cancel();
        throw new UploadValidationError("Upload size does not match its receipt.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  if (received !== expectedSize) {
    throw new UploadValidationError("Upload size does not match its receipt.");
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), received);
}
