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
import { auth } from "@/platform/auth";
import {
  presignUpload,
  UploadConfigError,
  UploadValidationError,
} from "@/platform/integrations/uploads";
import { pendoTrack } from "@/platform/integrations/pendo";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    filename?: string;
    contentType?: string;
    contentLength?: number;
  } | null;

  if (
    !body ||
    typeof body.filename !== "string" ||
    typeof body.contentType !== "string" ||
    typeof body.contentLength !== "number"
  ) {
    return Response.json(
      { error: "filename, contentType, contentLength are required" },
      { status: 400 },
    );
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

    const ext = body.filename.includes(".")
      ? body.filename.split(".").pop()!.toLowerCase()
      : "";
    pendoTrack("file_uploaded", {
      visitorId: session.user.id,
      properties: {
        contentType: body.contentType,
        contentLength: body.contentLength,
        fileExtension: ext,
      },
    });

    return Response.json(presigned);
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
