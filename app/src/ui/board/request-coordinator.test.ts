import assert from "node:assert/strict";
import test from "node:test";
import { BoardRequestCoordinator } from "./request-coordinator";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

test("edits to the same row persist in order, while other rows can proceed", async () => {
  const requests = new BoardRequestCoordinator();
  const first = deferred();
  const calls: string[] = [];
  const a = requests.enqueue("a", async () => { calls.push("a1"); await first.promise; });
  const b = requests.enqueue("a", async () => { calls.push("a2"); });
  await requests.enqueue("b", async () => { calls.push("b1"); });
  assert.deepEqual(calls, ["a1", "b1"]);
  first.resolve();
  await Promise.all([a, b]);
  assert.deepEqual(calls, ["a1", "b1", "a2"]);
});

test("an old read cannot overwrite a write, including after the write finishes", async () => {
  const requests = new BoardRequestCoordinator();
  const version = requests.readVersion();
  const blocked = deferred();
  const write = requests.enqueue("a", () => blocked.promise);
  assert.equal(requests.canApplyRead(version), false);
  blocked.resolve();
  await write;
  await requests.whenIdle();
  assert.equal(requests.canApplyRead(version), false);
  assert.equal(requests.canApplyRead(requests.readVersion()), true);
});

test("a rejected edit does not poison later edits or the idle wait", async () => {
  const requests = new BoardRequestCoordinator();
  const failed = requests.enqueue("a", async () => { throw new Error("refused"); });
  const next = requests.enqueue("a", async () => "saved");
  await assert.rejects(failed, /refused/);
  assert.equal(await next, "saved");
  await requests.whenIdle();
  assert.equal(requests.canApplyRead(requests.readVersion()), true);
});
