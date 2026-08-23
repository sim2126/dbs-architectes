/**
 * Upload adapter — same shape as the email sender. Two backends:
 *
 *   - S3 (production): direct browser→S3 PUT via a presigned URL.
 *     Activated when UPLOADS_S3_BUCKET is configured. Credentials come from
 *     explicit variables or the AWS SDK default task-role chain.
 *   - Local disk (demo): the browser POSTs to /api/uploads/local,
 *     the server writes below app/.data/uploads/ and returns an
 *     authenticated application URL. Used when no S3 env is configured.
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
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { fridayFileUrl } from "@/platform/integrations/upload-receipt";

// ─── Public types ───────────────────────────────────────────────────

export type PresignedUpload = {
  /** Where the browser PUTs (S3) or POSTs (local) the file bytes. */
  uploadUrl: string;
  /** Authorised application URL that serves the file once upload completes. */
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
  "png", "jpg", "jpeg", "gif", "webp", "avif", "heic", "heif", "bmp", "tif", "tiff",
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

const OCTET_STREAM = "application/octet-stream";
const ALLOWED_MIME_BY_EXT: Readonly<Record<string, ReadonlySet<string>>> = {
  png: new Set(["image/png"]),
  jpg: new Set(["image/jpeg"]),
  jpeg: new Set(["image/jpeg"]),
  gif: new Set(["image/gif"]),
  webp: new Set(["image/webp"]),
  avif: new Set(["image/avif"]),
  heic: new Set(["image/heic", "image/heif"]),
  heif: new Set(["image/heif", "image/heic"]),
  bmp: new Set(["image/bmp"]),
  tif: new Set(["image/tiff"]),
  tiff: new Set(["image/tiff"]),
  pdf: new Set(["application/pdf"]),
  doc: new Set(["application/msword", OCTET_STREAM]),
  docx: new Set([
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    OCTET_STREAM,
  ]),
  xls: new Set(["application/vnd.ms-excel", OCTET_STREAM]),
  xlsx: new Set([
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    OCTET_STREAM,
  ]),
  ppt: new Set(["application/vnd.ms-powerpoint", OCTET_STREAM]),
  pptx: new Set([
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    OCTET_STREAM,
  ]),
  txt: new Set(["text/plain", OCTET_STREAM]),
  md: new Set(["text/markdown", "text/plain", OCTET_STREAM]),
  csv: new Set([
    "text/csv",
    "application/csv",
    "application/vnd.ms-excel",
    "text/plain",
    OCTET_STREAM,
  ]),
  zip: new Set(["application/zip", "application/x-zip-compressed", OCTET_STREAM]),
  dwg: new Set(["application/acad", "application/x-acad", "image/vnd.dwg", OCTET_STREAM]),
  dxf: new Set(["application/dxf", "application/x-dxf", "image/vnd.dxf", OCTET_STREAM]),
  rfa: new Set([OCTET_STREAM]),
  rvt: new Set([OCTET_STREAM]),
  skp: new Set(["application/vnd.sketchup.skp", OCTET_STREAM]),
  ifc: new Set(["application/step", "application/x-step", "text/plain", OCTET_STREAM]),
  pln: new Set([OCTET_STREAM]),
  "3dm": new Set(["application/vnd.rhino", "x-world/x-3dmf", OCTET_STREAM]),
};

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
  if (!ext) {
    throw new UploadValidationError("Files must have an approved extension.");
  }
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
  const normalizedType = input.contentType.split(";", 1)[0]?.trim().toLowerCase();
  if (!normalizedType || !ALLOWED_MIME_BY_EXT[ext]?.has(normalizedType)) {
    throw new UploadValidationError(
      "The file extension and content type do not match an allowed upload type.",
    );
  }
}

/** Only byte formats browsers can preview without executing document markup. */
export function canServeUploadInline(filename: string, contentType: string): boolean {
  const ext = extOf(filename);
  const mime = contentType.split(";", 1)[0]?.trim().toLowerCase();
  return (
    (ext === "pdf" && mime === "application/pdf") ||
    (["png", "jpg", "jpeg", "gif", "webp", "avif", "heic", "heif", "bmp", "tif", "tiff"].includes(ext) &&
      ALLOWED_MIME_BY_EXT[ext]?.has(mime) === true &&
      mime !== OCTET_STREAM)
  );
}

// ─── Backend selection ──────────────────────────────────────────────

function s3Configured(): boolean {
  // ECS/Fargate should use its task role through the AWS SDK default
  // credential chain. Requiring a long-lived access-key environment variable
  // here makes a correctly configured production task look unconfigured.
  return Boolean(process.env.UPLOADS_S3_BUCKET);
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
  const uploadAccessKeyId = process.env.UPLOADS_S3_ACCESS_KEY_ID;
  const uploadSecretAccessKey = process.env.UPLOADS_S3_SECRET_ACCESS_KEY;
  const awsAccessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const awsSecretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  if (
    Boolean(uploadAccessKeyId) !== Boolean(uploadSecretAccessKey) ||
    Boolean(awsAccessKeyId) !== Boolean(awsSecretAccessKey)
  ) {
    throw new UploadConfigError(
      "S3 credentials are incomplete. Set both access-key fields or use the AWS default credential chain.",
    );
  }
  const accessKeyId = uploadAccessKeyId ?? awsAccessKeyId;
  const secretAccessKey = uploadSecretAccessKey ?? awsSecretAccessKey;
  const sessionToken = uploadAccessKeyId
    ? process.env.UPLOADS_S3_SESSION_TOKEN
    : process.env.AWS_SESSION_TOKEN;
  return new S3Client({
    region,
    ...(endpoint ? { endpoint, forcePathStyle: true } : {}),
    ...(accessKeyId && secretAccessKey
      ? {
          credentials: {
            accessKeyId,
            secretAccessKey,
            ...(sessionToken ? { sessionToken } : {}),
          },
        }
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
      ContentDisposition: `attachment; filename="${input.filename.replace(/["\r\n]/g, "_")}"`,
      IfNoneMatch: "*",
    }),
    { expiresIn: expiresSeconds },
  );
  // Store only an authenticated application URL. The S3 object remains
  // private and is read through /api/uploads/file after authorisation.
  return {
    uploadUrl,
    finalUrl: fridayFileUrl(key),
    method: "PUT",
    headers: { "Content-Type": input.contentType, "If-None-Match": "*" },
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
  // route handler writes them below .data/uploads/<key>. The final URL
  // is served by an authenticated route rather than the static file server.
  const uploadUrl = `${origin.replace(/\/$/, "")}/api/uploads/local?key=${encodeURIComponent(key)}`;
  const finalUrl = fridayFileUrl(key);
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
      "Uploads aren't configured for production. Set UPLOADS_S3_BUCKET and grant the task role access.",
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
  const filename = args.key.split("/").at(-1)?.replace(/^[a-f0-9]{24}-/, "") ?? "";
  validateUpload({
    filename,
    contentType: args.contentType,
    contentLength: args.bytes.byteLength,
  });
  const target = localUploadPath(args.key);
  await fs.mkdir(path.dirname(target), { recursive: true });
  try {
    await fs.writeFile(target, args.bytes, { flag: "wx" });
    try {
      await fs.writeFile(
        `${target}.meta.json`,
        JSON.stringify({ contentType: args.contentType }),
        { encoding: "utf8", flag: "wx" },
      );
    } catch (error) {
      await fs.unlink(target).catch(() => undefined);
      throw error;
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new UploadValidationError("This upload location has already been used.");
    }
    throw error;
  }
  return { publicUrl: fridayFileUrl(args.key) };
}

/** Confirm that a direct upload exists and still matches its signed metadata. */
export async function verifyStoredUpload(input: {
  key: string;
  sizeBytes: number;
  contentType: string;
}): Promise<void> {
  assertObjectKey(input.key);
  let actualSize: number;
  let actualContentType: string | null;

  try {
    if (!s3Configured()) {
      const target = localUploadPath(input.key);
      const [stat, metadataRaw] = await Promise.all([
        fs.stat(target),
        fs.readFile(`${target}.meta.json`, "utf8"),
      ]);
      let metadata: { contentType?: unknown };
      try {
        metadata = JSON.parse(metadataRaw) as { contentType?: unknown };
      } catch {
        throw new UploadValidationError(
          "The stored file does not match its upload receipt.",
        );
      }
      actualSize = stat.size;
      actualContentType =
        typeof metadata.contentType === "string" ? metadata.contentType : null;
    } else {
      const head = await s3Client().send(
        new HeadObjectCommand({
          Bucket: process.env.UPLOADS_S3_BUCKET!,
          Key: input.key,
        }),
      );
      actualSize = head.ContentLength ?? -1;
      actualContentType = head.ContentType ?? null;
    }
  } catch (error) {
    const storageError = error as NodeJS.ErrnoException & {
      name?: string;
      $metadata?: { httpStatusCode?: number };
    };
    if (
      storageError.code === "ENOENT" ||
      storageError.name === "NotFound" ||
      storageError.name === "NoSuchKey" ||
      storageError.$metadata?.httpStatusCode === 404
    ) {
      throw new UploadValidationError("The uploaded file could not be found.");
    }
    throw error;
  }

  const expectedType = input.contentType.split(";", 1)[0]?.trim().toLowerCase();
  const storedType = actualContentType?.split(";", 1)[0]?.trim().toLowerCase();
  if (actualSize !== input.sizeBytes || storedType !== expectedType) {
    throw new UploadValidationError("The stored file does not match its upload receipt.");
  }
}

export async function readStoredUpload(
  key: string,
  options: { maxBytes: number },
): Promise<{ bytes: Uint8Array; contentType: string | null }> {
  assertObjectKey(key);
  if (!Number.isSafeInteger(options.maxBytes) || options.maxBytes <= 0) {
    throw new UploadValidationError("Invalid download limit.");
  }

  if (!s3Configured()) {
    const target = localUploadPath(key);
    const stat = await fs.stat(target);
    if (stat.size > options.maxBytes) {
      throw new UploadValidationError("Stored file exceeds the permitted size.");
    }
    const metadata = await fs
      .readFile(`${target}.meta.json`, "utf8")
      .then((raw) => JSON.parse(raw) as { contentType?: unknown })
      .catch(() => null);
    const bytes = await fs.readFile(target);
    if (bytes.byteLength > options.maxBytes) {
      throw new UploadValidationError("Stored file exceeds the permitted size.");
    }
    return {
      bytes,
      contentType:
        typeof metadata?.contentType === "string" ? metadata.contentType : null,
    };
  }

  const result = await s3Client().send(
    new GetObjectCommand({ Bucket: process.env.UPLOADS_S3_BUCKET!, Key: key }),
  );
  if ((result.ContentLength ?? 0) > options.maxBytes) {
    (result.Body as { destroy?: () => void } | undefined)?.destroy?.();
    throw new UploadValidationError("Stored file exceeds the permitted size.");
  }
  if (!result.Body) throw new UploadValidationError("Stored file is unavailable.");

  const chunks: Uint8Array[] = [];
  let total = 0;
  for await (const chunk of result.Body as AsyncIterable<Uint8Array>) {
    const bytes = chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk);
    total += bytes.byteLength;
    if (total > options.maxBytes) {
      (result.Body as { destroy?: () => void }).destroy?.();
      throw new UploadValidationError("Stored file exceeds the permitted size.");
    }
    chunks.push(bytes);
  }

  return {
    bytes: Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))),
    contentType: result.ContentType ?? null,
  };
}

export async function deleteStoredUpload(key: string): Promise<void> {
  assertObjectKey(key);
  if (!s3Configured()) {
    await fs.unlink(localUploadPath(key)).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
    });
    await fs
      .unlink(`${localUploadPath(key)}.meta.json`)
      .catch((error: NodeJS.ErrnoException) => {
        if (error.code !== "ENOENT") throw error;
      });
    return;
  }
  await s3Client().send(
    new DeleteObjectCommand({ Bucket: process.env.UPLOADS_S3_BUCKET!, Key: key }),
  );
}

/**
 * Enumerate managed objects old enough that no valid upload receipt can still
 * create a new database reference. Used by the scheduled orphan collector;
 * callers must still check live Message and AiChatAttachment references.
 */
export async function listStoredUploadsOlderThan(
  cutoff: Date,
  options: { limit?: number } = {},
): Promise<string[]> {
  const limit = Math.max(1, Math.min(options.limit ?? 500, 5_000));
  if (!s3Configured()) {
    const root = path.join(process.cwd(), ".data", "uploads");
    const matches: string[] = [];

    async function visit(directory: string): Promise<void> {
      if (matches.length >= limit) return;
      let entries;
      try {
        entries = await fs.readdir(directory, { withFileTypes: true });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
        throw error;
      }
      for (const entry of entries) {
        if (matches.length >= limit) return;
        const fullPath = path.join(directory, entry.name);
        if (entry.isDirectory()) {
          await visit(fullPath);
        } else if (entry.isFile() && !entry.name.endsWith(".meta.json")) {
          const stat = await fs.stat(fullPath);
          if (stat.mtime < cutoff) {
            const key = path.relative(root, fullPath).split(path.sep).join("/");
            assertObjectKey(key);
            matches.push(key);
          }
        }
      }
    }

    await visit(root);
    return matches;
  }

  const matches: string[] = [];
  const client = s3Client();
  let continuationToken: string | undefined;
  do {
    const page = await client.send(
      new ListObjectsV2Command({
        Bucket: process.env.UPLOADS_S3_BUCKET!,
        Prefix: "chat/",
        ContinuationToken: continuationToken,
        MaxKeys: Math.min(1_000, limit - matches.length),
      }),
    );
    for (const object of page.Contents ?? []) {
      if (matches.length >= limit) break;
      if (!object.Key || !object.LastModified || object.LastModified >= cutoff) continue;
      assertObjectKey(object.Key);
      matches.push(object.Key);
    }
    continuationToken = page.IsTruncated && matches.length < limit
      ? page.NextContinuationToken
      : undefined;
  } while (continuationToken);

  return matches;
}

function assertObjectKey(key: string): void {
  // Reuse the receipt/download URL validator so disk and S3 paths share one
  // traversal boundary.
  fridayFileUrl(key);
}

function localUploadPath(key: string): string {
  assertObjectKey(key);
  return path.join(process.cwd(), ".data", "uploads", key);
}
