import assert from "node:assert/strict";
import test from "node:test";
import { parseChannelCreateInput } from "./channel-input";

test("channel input normalises a valid channel", () => {
  assert.deepEqual(
    parseChannelCreateInput({
      name: " Design Reviews ",
      description: " Weekly decisions ",
      type: "private",
      memberIds: ["user-1", "user-2"],
    }),
    {
      ok: true,
      value: {
        name: "design-reviews",
        description: "Weekly decisions",
        type: "private",
        memberIds: ["user-1", "user-2"],
      },
    },
  );
});

test("channel input rejects malformed types and duplicate members", () => {
  assert.equal(parseChannelCreateInput({ name: "x", type: "project" }).ok, false);
  assert.equal(
    parseChannelCreateInput({ name: "x", memberIds: ["user-1", "user-1"] }).ok,
    false,
  );
  assert.equal(parseChannelCreateInput({ name: 42 }).ok, false);
});
