import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { channelInvalidation } from "./realtime";

test("chat real-time payloads contain no message or identity data", () => {
  assert.deepEqual(channelInvalidation("channel-1"), { channelId: "channel-1" });
  assert.deepEqual(Object.keys(channelInvalidation("channel-1")), ["channelId"]);
});

test("every server-side chat Pusher producer uses the invalidation contract", () => {
  const producers = [
    "src/app/api/chat/messages/route.ts",
    "src/app/api/chat/messages/[id]/route.ts",
    "src/app/api/chat/messages/[id]/reactions/route.ts",
    "src/app/api/projects/[id]/thread/route.ts",
    "src/app/api/calls/[id]/share-to-thread/route.ts",
  ];
  for (const producer of producers) {
    const source = readFileSync(join(process.cwd(), producer), "utf8");
    assert.match(source, /channelInvalidation\(/, `${producer} bypasses the safe event DTO`);
  }
});

test("workspace call events publish only ids and cannot overturn committed writes", () => {
  const createSource = readFileSync(
    join(process.cwd(), "src/app/api/calls/route.ts"),
    "utf8",
  );
  assert.match(
    createSource,
    /PUSHER_EVENTS\.CALL_STARTED,\s*\{\s*id:\s*call\.id\s*\}/,
  );
  assert.doesNotMatch(createSource, /PUSHER_EVENTS\.CALL_STARTED,\s*call\s*\)/);
  assert.match(createSource, /catch \(error\)[\s\S]*real-time start delivery failed/);

  const endSource = readFileSync(
    join(process.cwd(), "src/app/api/calls/[id]/route.ts"),
    "utf8",
  );
  assert.match(endSource, /catch \(error\)[\s\S]*real-time end delivery failed/);
});

test("project-channel guest admission also requires project assignment authority", () => {
  const source = readFileSync(
    join(process.cwd(), "src/app/api/chat/channels/[id]/members/route.ts"),
    "utf8",
  );
  assert.match(source, /if \(channel\.projectId\)[\s\S]*authorize\(subject, "project:assign", project\)/);
});

test("direct conversations are pair-serialised and cannot gain a third member", () => {
  const createSource = readFileSync(
    join(process.cwd(), "src/app/api/chat/channels/route.ts"),
    "utf8",
  );
  assert.match(createSource, /pg_advisory_xact_lock/);
  assert.match(createSource, /const directKey = `direct:/);

  const memberSource = readFileSync(
    join(process.cwd(), "src/app/api/chat/channels/[id]/members/route.ts"),
    "utf8",
  );
  assert.match(memberSource, /channel\.type === "direct"/);
});
