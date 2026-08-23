import assert from "node:assert/strict";
import test from "node:test";
import { decodeMessageCursor, encodeMessageCursor } from "./message-cursor";

test("message cursor round-trips the stable timestamp and id order", () => {
  const createdAt = new Date("2026-08-23T12:34:56.789Z");
  const encoded = encodeMessageCursor({ createdAt, id: "cm123" });
  assert.deepEqual(decodeMessageCursor(encoded), { createdAt, id: "cm123" });
});

test("message cursor rejects timestamps without the id tie-breaker", () => {
  assert.equal(decodeMessageCursor("2026-08-23T12:34:56.789Z"), null);
  assert.equal(decodeMessageCursor("not-a-date|cm123"), null);
  assert.equal(decodeMessageCursor("2026-08-23T12:34:56.789Z|"), null);
});
