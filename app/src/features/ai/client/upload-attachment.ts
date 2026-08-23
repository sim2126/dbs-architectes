"use client";

type PresignedAiUpload = {
  uploadUrl: string;
  finalUrl: string;
  method: "PUT" | "POST";
  headers: Record<string, string>;
  receipt: string;
};

export class AiUploadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiUploadError";
  }
}

export async function uploadAiAttachment(
  file: File,
  sessionId: string,
): Promise<{ id: string; filename: string }> {
  const presignResponse = await fetch("/api/uploads/presign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      filename: file.name,
      contentType: file.type || "application/octet-stream",
      contentLength: file.size,
      purpose: "ai",
      targetId: sessionId,
    }),
  });
  if (!presignResponse.ok) throw await responseError(presignResponse, file.name);
  const presigned = (await presignResponse.json()) as PresignedAiUpload;
  if (
    !presigned.uploadUrl ||
    !presigned.finalUrl ||
    !presigned.receipt ||
    (presigned.method !== "PUT" && presigned.method !== "POST")
  ) {
    throw new AiUploadError(`Friday could not prepare ${file.name} for upload.`);
  }

  const uploadResponse = await fetch(presigned.uploadUrl, {
    method: presigned.method,
    headers: presigned.headers,
    body: file,
  });
  if (!uploadResponse.ok) {
    throw new AiUploadError(`Upload failed for ${file.name}.`);
  }

  const recordResponse = await fetch("/api/ai-attachments", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ receipt: presigned.receipt, sessionId }),
  });
  if (!recordResponse.ok) throw await responseError(recordResponse, file.name);
  const recorded = (await recordResponse.json()) as {
    attachment?: { id?: string; filename?: string };
  };
  if (!recorded.attachment?.id) {
    throw new AiUploadError(`Friday could not attach ${file.name}.`);
  }
  return {
    id: recorded.attachment.id,
    filename: recorded.attachment.filename ?? file.name,
  };
}

export async function ingestAiAttachment(id: string): Promise<void> {
  const response = await fetch("/api/ai-attachments/ingest", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id }),
  });
  if (!response.ok) throw await responseError(response, "the attachment");
  const result = (await response.json()) as {
    results?: Array<{ id: string; ok: boolean; reason?: string }>;
  };
  const attachmentResult = result.results?.find((item) => item.id === id);
  if (attachmentResult && !attachmentResult.ok) {
    throw new AiUploadError(
      attachmentResult.reason ?? "AI Assistant could not read the attachment.",
    );
  }
}

async function responseError(response: Response, filename: string): Promise<AiUploadError> {
  const body = (await response.json().catch(() => null)) as { error?: string } | null;
  return new AiUploadError(body?.error ?? `Could not upload ${filename}.`);
}
