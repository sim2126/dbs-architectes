/**
 * Upload adapter — same shape as the email sender. Two backends:
 *
 *   - S3 (production): direct browser→S3 PUT via a presigned URL.
 *     Activated when UPLOADS_S3_BUCKET (and creds) are configured.
 *   - Local disk (demo): the browser POSTs to /api/uploads/local,
 *     the server writes the file into app/public/uploads/ and
 *     returns the public path. Used when no S3 env is configured.
 *
 * The adapter never silently downgrades in production. If NODE_ENV
 * is "production" and S3 isn't configured, presignUpload() throws
 * so the route can return a clean 503 rather than write to a
 * filesystem that doesn't survive container restart.
 *
 * Server-only. Do NOT import from client code.
 */

import crypto from "node:crypto";
import path from "node:path";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// ─── Public types ───────────────────────────────────────────────────

export type PresignedUpload = {
  /** Where the browser PUTs (S3) or POSTs (local) the file bytes. */
  uploadUrl: string;
  /** Public URL that will serve the file once upload completes. */
  finalUrl: string;
  /** HTTP method the browser must use against `uploadUrl`. */
  method: "PUT" | "POST";
  /** Extra headers the browser must include on the upload request. */
  headers: Record<string, string>;
  /** ISO timestamp after which the presigned URL is invalid. */
  expiresAt: string;
  /** Backend that signed the URL — useful for telemetry. */
  backend: "s3" | "local";
};

export type PresignInput = {
  filename: string;
  contentType: string;
  contentLength: number;
};

// ─── Limits and allowlist ───────────────────────────────────────────

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB

// Architecture firms share these: plans (DWG / RFA / SKP / IFC /
// archicad PLN), images, PDFs, common office formats. Executables and
// scripts are out — anything that could run on a teammate's machine
// shouldn't be shareable through a chat composer.
const ALLOWED_EXT = new Set([
  // images
  "png", "jpg", "jpeg", "gif", "webp", "avif", "svg", "heic",
  // docs
  "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "md", "csv",
  // architecture
  "dwg", "dxf", "rfa", "rvt", "skp", "ifc", "pln", "3dm",
  // archives
  "zip",
]);

const FORBIDDEN_EXT = new Set([
  "exe", "bat", "cmd", "sh", "ps1", "msi", "scr", "com", "vbs", "js",
  "jar", "dll", "app",
]);

export class UploadValidationError extends Error {
  constructor(public readonly userMessage: string) {
    super(userMessage);
    this.name = "UploadValidationError";
  }
}

export class UploadConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UploadConfigError";
  }
}

function extOf(filename: string): string {
  const ext = path.extname(filename).slice(1).toLowerCase();
  return ext;
}

export function validateUpload(input: PresignInput): void {
  if (!input.filename || input.filename.length > 200) {
    throw new UploadValidationError("Filename is missing or too long.");
  }
  if (input.contentLength <= 0) {
    throw new UploadValidationError("File is empty.");
  }
  if (input.contentLength > MAX_UPLOAD_BYTES) {
    throw new UploadValidationError(
      `File is larger than ${Math.round(MAX_UPLOAD_BYTES / (1024 * 1024))} MB.`,
    );
  }
  const ext = extOf(input.filename);
  if (FORBIDDEN_EXT.has(ext)) {
    throw new UploadValidationError(
      `.${ext} files can't be shared in chat for security reasons.`,
    );
  }
  if (ext.length > 0 && !ALLOWED_EXT.has(ext)) {
    throw new UploadValidationError(
      `.${ext} isn't on the allowed file types list.`,
    );
  }
}

// ─── Backend selection ──────────────────────────────────────────────

function s3Configured(): boolean {
  return Boolean(
    process.env.UPLOADS_S3_BUCKET &&
      (process.env.AWS_ACCESS_KEY_ID || process.env.UPLOADS_S3_ACCESS_KEY_ID),
  );
}

function objectKey(filename: string): string {
  const id = crypto.randomBytes(12).toString("hex");
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 100);
  // YYYY/MM prefix keeps the bucket listable.
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `chat/${y}/${m}/${id}-${safe}`;
}

// ─── S3 adapter ─────────────────────────────────────────────────────

function s3Client(): S3Client {
  const region = process.env.UPLOADS_S3_REGION ?? process.env.AWS_REGION ?? "eu-central-1";
  const endpoint = process.env.UPLOADS_S3_ENDPOINT;
  const accessKeyId = process.env.UPLOADS_S3_ACCESS_KEY_ID ?? process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey =
    process.env.UPLOADS_S3_SECRET_ACCESS_KEY ?? process.env.AWS_SECRET_ACCESS_KEY;
  return new S3Client({
    region,
    ...(endpoint ? { endpoint, forcePathStyle: true } : {}),
    ...(accessKeyId && secretAccessKey
      ? { credentials: { accessKeyId, secretAccessKey } }
      : {}),
  });
}

async function presignS3(input: PresignInput): Promise<PresignedUpload> {
  const bucket = process.env.UPLOADS_S3_BUCKET!;
  const key = objectKey(input.filename);
  const expiresSeconds = 300;
  const client = s3Client();
  const uploadUrl = await getSignedUrl(
    client,
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: input.contentType,
      ContentLength: input.contentLength,
    }),
    { expiresIn: expiresSeconds },
  );
  // Public URL — if a CDN base is configured we use that; otherwise
  // we use the S3 virtual-hosted-style URL (works for buckets with
  // public-read or via a CloudFront distribution upstream).
  const publicBase =
    process.env.UPLOADS_PUBLIC_BASE_URL ??
    `https://${bucket}.s3.${process.env.UPLOADS_S3_REGION ?? process.env.AWS_REGION ?? "eu-central-1"}.amazonaws.com`;
  return {
    uploadUrl,
    finalUrl: `${publicBase.replace(/\/$/, "")}/${key}`,
    method: "PUT",
    headers: { "Content-Type": input.contentType },
    expiresAt: new Date(Date.now() + expiresSeconds * 1000).toISOString(),
    backend: "s3",
  };
}

// ─── Local-disk adapter ─────────────────────────────────────────────

function presignLocal(
  input: PresignInput,
  origin: string,
): PresignedUpload {
  const key = objectKey(input.filename);
  // The browser POSTs the bytes to /api/uploads/local?key=... and the
  // route handler writes them to public/uploads/<key>. The final URL
  // is served by Next.js as a static asset.
  const uploadUrl = `${origin.replace(/\/$/, "")}/api/uploads/local?key=${encodeURIComponent(key)}`;
  const finalUrl = `/uploads/${key}`;
  return {
    uploadUrl,
    finalUrl,
    method: "POST",
    headers: { "Content-Type": input.contentType },
    expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    backend: "local",
  };
}

// ─── Entry point ────────────────────────────────────────────────────

export async function presignUpload(
  input: PresignInput,
  options: { origin: string },
): Promise<PresignedUpload> {
  validateUpload(input);

  if (s3Configured()) {
    return presignS3(input);
  }
  if (process.env.NODE_ENV === "production") {
    throw new UploadConfigError(
      "Uploads aren't configured for production. Set UPLOADS_S3_BUCKET + credentials.",
    );
  }
  return presignLocal(input, options.origin);
}

// ─── Local-disk write (used by /api/uploads/local) ──────────────────

import { promises as fs } from "node:fs";

export async function writeLocalUpload(args: {
  key: string;
  bytes: Buffer;
  contentType: string;
}): Promise<{ publicUrl: string }> {
  if (process.env.NODE_ENV === "production") {
    throw new UploadConfigError(
      "Local-disk uploads are disabled in production.",
    );
  }
  // The key was minted by presignLocal() and contains only safe chars.
  // We re-validate to be defensive: no slashes outside the chat/ prefix,
  // no leading dot/slash, no .. traversal.
  if (
    !args.key.startsWith("chat/") ||
    args.key.includes("..") ||
    /[^a-zA-Z0-9._\-/]/.test(args.key)
  ) {
    throw new UploadValidationError("Invalid upload key.");
  }
  const target = path.join(process.cwd(), "public", "uploads", args.key);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, args.bytes);
  return { publicUrl: `/uploads/${args.key}` };
}
