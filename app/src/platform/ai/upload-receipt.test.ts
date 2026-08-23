import assert from "node:assert/strict";
import test from "node:test";
import {
  issueUploadReceipt,
  UploadReceiptError,
  verifyUploadReceipt,
} from "@/platform/integrations/upload-receipt";
import {
  canServeUploadInline,
  validateUpload,
} from "@/platform/integrations/uploads";

const input = {
  userId: "user-1",
  finalUrl: "/api/uploads/file?key=chat%2F2026%2F08%2Fabc-file.pdf",
  filename: "file.pdf",
  contentType: "application/pdf",
  sizeBytes: 42,
  backend: "local" as const,
  purpose: "chat" as const,
  targetId: "channel-1",
};

test("upload receipts bind owner and platform object metadata", () => {
  const receipt = issueUploadReceipt(input, { secret: "test-secret", now: 1000 });
  const verified = verifyUploadReceipt(receipt, "user-1", {
    secret: "test-secret",
    now: 1100,
  });
  assert.equal(verified.objectKey, "chat/2026/08/abc-file.pdf");
  assert.equal(verified.contentType, "application/pdf");
  assert.equal(verified.sizeBytes, 42);
  assert.equal(verified.purpose, "chat");
  assert.equal(verified.targetId, "channel-1");
});

test("upload receipts cannot be replayed across a purpose or target", () => {
  const receipt = issueUploadReceipt(input, { secret: "test-secret", now: 1000 });
  assert.doesNotThrow(() =>
    verifyUploadReceipt(receipt, "user-1", {
      secret: "test-secret",
      now: 1100,
      expectedPurpose: "chat",
      expectedTargetId: "channel-1",
    }),
  );
  assert.throws(
    () => verifyUploadReceipt(receipt, "user-1", {
      secret: "test-secret",
      now: 1100,
      expectedPurpose: "ai",
      expectedTargetId: "channel-1",
    }),
    UploadReceiptError,
  );
  assert.throws(
    () => verifyUploadReceipt(receipt, "user-1", {
      secret: "test-secret",
      now: 1100,
      expectedPurpose: "chat",
      expectedTargetId: "channel-2",
    }),
    UploadReceiptError,
  );
});

test("upload receipts reject tampering, another owner and expiry", () => {
  const receipt = issueUploadReceipt({ ...input, expiresAt: 2000 }, {
    secret: "test-secret",
    now: 1000,
  });
  assert.throws(
    () => verifyUploadReceipt(receipt, "user-2", { secret: "test-secret", now: 1100 }),
    UploadReceiptError,
  );
  assert.throws(
    () => verifyUploadReceipt(`${receipt}x`, "user-1", { secret: "test-secret", now: 1100 }),
    UploadReceiptError,
  );
  assert.throws(
    () => verifyUploadReceipt(receipt, "user-1", { secret: "test-secret", now: 2100 }),
    UploadReceiptError,
  );
});

test("uploads reject executable document MIME types hidden behind safe extensions", () => {
  assert.throws(
    () =>
      validateUpload({
        filename: "notes.txt",
        contentType: "application/xhtml+xml",
        contentLength: 100,
      }),
    /extension and content type/,
  );
  assert.throws(
    () =>
      validateUpload({
        filename: "drawing.png",
        contentType: "image/svg+xml",
        contentLength: 100,
      }),
    /extension and content type/,
  );
});

test("only non-executable raster images and PDFs are served inline", () => {
  validateUpload({
    filename: "drawing.pdf",
    contentType: "application/pdf",
    contentLength: 100,
  });
  assert.equal(canServeUploadInline("drawing.pdf", "application/pdf"), true);
  assert.equal(canServeUploadInline("photo.png", "image/png"), true);
  assert.equal(canServeUploadInline("notes.txt", "application/xhtml+xml"), false);
  assert.equal(
    canServeUploadInline(
      "brief.docx",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ),
    false,
  );
});
