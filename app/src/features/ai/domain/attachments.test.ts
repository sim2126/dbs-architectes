import assert from "node:assert/strict";
import test from "node:test";
import {
  ACCEPT_ATTRIBUTE,
  attachmentState,
  formatSize,
  INGESTIBLE_TYPES,
  isIngestibleType,
  kindForType,
} from "./attachments";

test("accepts the four requested families and nothing else", () => {
  assert.ok(isIngestibleType("application/pdf"));
  assert.ok(isIngestibleType("image/png"));
  assert.ok(isIngestibleType("text/csv"));
  assert.ok(
    isIngestibleType(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ),
  );

  // Refused on purpose: accepting a type the pipeline will never read means
  // storing something the user believes is context.
  assert.equal(isIngestibleType("application/msword"), false);
  assert.equal(isIngestibleType("application/zip"), false);
  assert.equal(isIngestibleType("image/vnd.dwg"), false);
  assert.equal(isIngestibleType("text/plain"), false);
});

test("a charset parameter does not defeat the check", () => {
  // Browsers routinely send "text/csv;charset=utf-8"; a naive equality test
  // would reject a perfectly valid upload.
  assert.ok(isIngestibleType("text/csv;charset=utf-8"));
  assert.ok(isIngestibleType("text/csv; charset=UTF-8"));
  assert.ok(isIngestibleType("APPLICATION/PDF"));
});

test("every type maps to an extraction kind", () => {
  for (const { mime, kind } of INGESTIBLE_TYPES) {
    assert.equal(kindForType(mime), kind, `${mime} should map to ${kind}`);
  }
  assert.equal(kindForType("application/msword"), null);
});

test("the accept attribute covers every listed type", () => {
  for (const { mime } of INGESTIBLE_TYPES) {
    assert.ok(ACCEPT_ATTRIBUTE.includes(mime), `${mime} missing from accept`);
  }
});

test("a stored file is not reported as readable", () => {
  // The load-bearing case: until ingestion runs, the assistant has not seen
  // the file and the UI must not imply otherwise.
  assert.equal(
    attachmentState({ ingestedAt: null, ingestError: null }),
    "stored",
  );
  assert.equal(
    attachmentState({ ingestedAt: "2026-08-20T10:00:00Z", ingestError: null }),
    "ready",
  );
});

test("a failure outranks a completion timestamp", () => {
  // If both are somehow set, the error wins — reporting a partly-failed
  // extraction as readable is the dangerous direction.
  assert.equal(
    attachmentState({
      ingestedAt: "2026-08-20T10:00:00Z",
      ingestError: "OCR timed out",
    }),
    "failed",
  );
});

test("sizes are formatted in units people read", () => {
  assert.equal(formatSize(512), "512 B");
  assert.equal(formatSize(2048), "2 KB");
  assert.equal(formatSize(5 * 1024 * 1024), "5.0 MB");
});
