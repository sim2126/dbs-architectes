import assert from "node:assert/strict";
import test from "node:test";
import {
  groupCheckState,
  pruneSelection,
  selectRange,
  selectionLabel,
  toggle,
  toggleGroup,
} from "./selection";

const ORDER = ["a", "b", "c", "d", "e"];

test("toggle adds then removes", () => {
  const once = toggle(new Set(), "a");
  assert.deepEqual([...once], ["a"]);
  assert.deepEqual([...toggle(once, "a")], []);
});

test("selectRange covers the span in board order, both directions", () => {
  assert.deepEqual([...selectRange(new Set(), ORDER, "b", "d")].sort(), ["b", "c", "d"]);
  assert.deepEqual([...selectRange(new Set(), ORDER, "d", "b")].sort(), ["b", "c", "d"]);
});

test("selectRange keeps rows outside the span untouched", () => {
  const result = selectRange(new Set(["e"]), ORDER, "a", "b");
  assert.deepEqual([...result].sort(), ["a", "b", "e"]);
});

test("selectRange falls back to a plain toggle when the anchor is gone", () => {
  assert.deepEqual([...selectRange(new Set(), ORDER, "zz", "c")], ["c"]);
});

test("toggleGroup selects the whole group, then clears it", () => {
  const all = toggleGroup(new Set(), ["a", "b"]);
  assert.deepEqual([...all].sort(), ["a", "b"]);
  assert.deepEqual([...toggleGroup(all, ["a", "b"])], []);
});

test("toggleGroup completes a partly selected group rather than clearing it", () => {
  const result = toggleGroup(new Set(["a"]), ["a", "b", "c"]);
  assert.deepEqual([...result].sort(), ["a", "b", "c"]);
});

test("groupCheckState distinguishes none, some and all", () => {
  assert.equal(groupCheckState(new Set(), ["a", "b"]), "none");
  assert.equal(groupCheckState(new Set(["a"]), ["a", "b"]), "some");
  assert.equal(groupCheckState(new Set(["a", "b"]), ["a", "b"]), "all");
  assert.equal(groupCheckState(new Set(["a"]), []), "none");
});

test("pruneSelection drops rows that left the board", () => {
  assert.deepEqual([...pruneSelection(new Set(["a", "z"]), ORDER)], ["a"]);
});

test("selectionLabel is singular for one row", () => {
  assert.equal(selectionLabel(0), "");
  assert.equal(selectionLabel(1), "1 project selected");
  assert.equal(selectionLabel(4), "4 projects selected");
  assert.equal(selectionLabel(2, "item"), "2 items selected");
});
