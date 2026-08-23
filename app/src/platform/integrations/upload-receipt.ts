import crypto from "node:crypto";

const RECEIPT_VERSION = 1;
export const UPLOAD_RECEIPT_TTL_MS = 5 * 60 * 1000;
const FILE_ROUTE = "/api/uploads/file";

export type UploadReceiptPayload = {
  version: typeof RECEIPT_VERSION;
  userId: string;
  objectKey: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  backend: "s3" | "local";
  purpose: "chat" | "ai";
  targetId: string;
  expiresAt: number;
};

export class UploadReceiptError extends Error {
  constructor(message = "The upload receipt is invalid or has expired.") {
    super(message);
    this.name = "UploadReceiptError";
  }
}

/**
 * Pull the opaque storage key out of Friday's authorised download URL.
 *
 * Newly issued uploads are deliberately represented by a same-origin route,
 * never by a caller-controlled URL. This is the trust boundary used by the AI
 * ingestion path: it can read a platform object key, but it cannot be turned
 * into a general-purpose HTTP client.
 */
export function objectKeyFromFridayFileUrl(finalUrl: string): string {
  if (!finalUrl.startsWith("/") || finalUrl.startsWith("//")) {
    throw new UploadReceiptError("The upload location was not issued by Friday.");
  }
  const parsed = new URL(finalUrl, "https://friday.invalid");
  if (parsed.pathname !== FILE_ROUTE || parsed.searchParams.size !== 1) {
    throw new UploadReceiptError("The upload location was not issued by Friday.");
  }
  const key = parsed.searchParams.get("key") ?? "";
  if (!isValidObjectKey(key)) {
    throw new UploadReceiptError("The upload location was not issued by Friday.");
  }
  return key;
}

export function fridayFileUrl(objectKey: string): string {
  if (!isValidObjectKey(objectKey)) {
    throw new UploadReceiptError("The upload key is invalid.");
  }
  return `${FILE_ROUTE}?key=${encodeURIComponent(objectKey)}`;
}

export function issueUploadReceipt(
  input: Omit<UploadReceiptPayload, "version" | "expiresAt" | "objectKey"> & {
    finalUrl: string;
    expiresAt?: number;
  },
  options: { secret?: string; now?: number } = {},
): string {
  const now = options.now ?? Date.now();
  const payload: UploadReceiptPayload = {
    version: RECEIPT_VERSION,
    userId: input.userId,
    objectKey: objectKeyFromFridayFileUrl(input.finalUrl),
    filename: input.filename,
    contentType: normaliseContentType(input.contentType),
    sizeBytes: input.sizeBytes,
    backend: input.backend,
    purpose: input.purpose,
    targetId: input.targetId,
    expiresAt: input.expiresAt ?? now + UPLOAD_RECEIPT_TTL_MS,
  };
  assertPayload(payload, now, false);

  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${encoded}.${sign(encoded, receiptSecret(options.secret))}`;
}

export function verifyUploadReceipt(
  receipt: string,
  expectedUserId: string,
  options: {
    secret?: string;
    now?: number;
    expectedPurpose?: UploadReceiptPayload["purpose"];
    expectedTargetId?: string;
  } = {},
): UploadReceiptPayload {
  const [encoded, suppliedSignature, extra] = receipt.split(".");
  if (!encoded || !suppliedSignature || extra !== undefined) {
    throw new UploadReceiptError();
  }

  const expectedSignature = sign(encoded, receiptSecret(options.secret));
  const supplied = Buffer.from(suppliedSignature, "utf8");
  const expected = Buffer.from(expectedSignature, "utf8");
  if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) {
    throw new UploadReceiptError();
  }

  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    throw new UploadReceiptError();
  }
  assertPayload(decoded, options.now ?? Date.now(), true);
  if (
    decoded.userId !== expectedUserId ||
    (options.expectedPurpose !== undefined &&
      decoded.purpose !== options.expectedPurpose) ||
    (options.expectedTargetId !== undefined &&
      decoded.targetId !== options.expectedTargetId)
  ) {
    throw new UploadReceiptError();
  }
  return decoded;
}

function sign(encoded: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(encoded).digest("base64url");
}

function receiptSecret(explicit?: string): string {
  const configured = explicit ?? process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (configured) return configured;
  if (process.env.NODE_ENV !== "production") return "friday-local-upload-receipt";
  throw new UploadReceiptError("Upload receipts are not configured.");
}

function assertPayload(
  value: unknown,
  now: number,
  enforceExpiry: boolean,
): asserts value is UploadReceiptPayload {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new UploadReceiptError();
  }
  const payload = value as Record<string, unknown>;
  if (
    payload.version !== RECEIPT_VERSION ||
    typeof payload.userId !== "string" ||
    !payload.userId ||
    typeof payload.objectKey !== "string" ||
    !isValidObjectKey(payload.objectKey) ||
    typeof payload.filename !== "string" ||
    !payload.filename ||
    typeof payload.contentType !== "string" ||
    !payload.contentType ||
    typeof payload.sizeBytes !== "number" ||
    !Number.isSafeInteger(payload.sizeBytes) ||
    payload.sizeBytes <= 0 ||
    (payload.backend !== "s3" && payload.backend !== "local") ||
    (payload.purpose !== "chat" && payload.purpose !== "ai") ||
    typeof payload.targetId !== "string" ||
    !payload.targetId ||
    typeof payload.expiresAt !== "number" ||
    !Number.isSafeInteger(payload.expiresAt) ||
    payload.expiresAt > now + UPLOAD_RECEIPT_TTL_MS + 5_000 ||
    (enforceExpiry && payload.expiresAt <= now)
  ) {
    throw new UploadReceiptError();
  }
}

function isValidObjectKey(key: string): boolean {
  return (
    key.startsWith("chat/") &&
    key.length <= 240 &&
    !key.includes("..") &&
    !key.startsWith("/") &&
    /^[a-zA-Z0-9._/-]+$/.test(key)
  );
}

function normaliseContentType(contentType: string): string {
  return contentType.split(";", 1)[0]?.trim().toLowerCase() ?? "";
}
