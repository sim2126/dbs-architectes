import assert from "node:assert/strict";
import test from "node:test";
import { readServerSentEvents } from "./sse";

test("SSE parser preserves events split across arbitrary chunks", async () => {
  const encoder = new TextEncoder();
  const chunks = [
    'data: {"type":"blo',
    'cks","blocks":[]}\r\n\r\ndata: {"type":"done"}\n\n',
  ];
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      chunks.forEach((chunk) => controller.enqueue(encoder.encode(chunk)));
      controller.close();
    },
  });
  const events: Array<{ type: string }> = [];
  await readServerSentEvents(body, (event: { type: string }) => {
    events.push(event);
  });
  assert.deepEqual(events.map((event) => event.type), ["blocks", "done"]);
});

test("SSE parser reads a final event without a trailing blank line", async () => {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode('data: {"type":"error","message":"safe"}'));
      controller.close();
    },
  });
  const events: Array<{ type: string; message?: string }> = [];
  await readServerSentEvents(body, (event: { type: string; message?: string }) => {
    events.push(event);
  });
  assert.deepEqual(events, [{ type: "error", message: "safe" }]);
});
