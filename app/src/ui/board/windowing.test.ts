import assert from "node:assert/strict";
import test from "node:test";
import {
  fullWindow,
  shouldWindow,
  windowGroups,
  WINDOW_THRESHOLD,
  type WindowMetrics,
} from "./windowing";

const METRICS: WindowMetrics = { rowHeight: 36, headerHeight: 44, footerHeight: 60, emptyHeight: 36 };
const VIEWPORT = 720;

const group = (rowCount: number, collapsed = false) => ({ rowCount, collapsed });

/** Every group renders a contiguous slice, and the spacers cover the rest. */
function assertHeightsAddUp(
  windows: ReturnType<typeof windowGroups>,
  groups: { rowCount: number; collapsed: boolean }[],
) {
  windows.forEach((w, i) => {
    const g = groups[i];
    if (g.collapsed) return;
    const rendered = w.lastIndex < w.firstIndex ? 0 : w.lastIndex - w.firstIndex + 1;
    const accounted = w.topSpacer + w.bottomSpacer + rendered * METRICS.rowHeight;
    assert.equal(
      accounted,
      g.rowCount * METRICS.rowHeight,
      `group ${i}: spacers plus rendered rows must equal the group's real height`,
    );
  });
}

test("small boards are not windowed at all", () => {
  assert.equal(shouldWindow(24), false);
  assert.equal(shouldWindow(WINDOW_THRESHOLD), false);
  assert.equal(shouldWindow(WINDOW_THRESHOLD + 1), true);
});

test("fullWindow renders every row of every open group", () => {
  const groups = [group(3), group(0), group(5, true)];
  assert.deepEqual(fullWindow(groups), [
    { firstIndex: 0, lastIndex: 2, topSpacer: 0, bottomSpacer: 0 },
    { firstIndex: 0, lastIndex: -1, topSpacer: 0, bottomSpacer: 0 },
    { firstIndex: 0, lastIndex: -1, topSpacer: 0, bottomSpacer: 0 },
  ]);
});

test("at the top of a long board only the first group is rendered", () => {
  const groups = [group(200), group(200), group(200)];
  const windows = windowGroups(groups, 0, VIEWPORT, METRICS);

  assert.equal(windows[0].firstIndex, 0);
  assert.ok(windows[0].lastIndex < 60, "far fewer than the group's 200 rows");
  assert.equal(windows[1].lastIndex, -1, "the second group is out of sight");
  assert.equal(windows[2].lastIndex, -1);
  assertHeightsAddUp(windows, groups);
});

test("scrolling into the second group renders it and drops the first", () => {
  const groups = [group(200), group(200)];
  // Far enough past the first group that even the overscan does not reach
  // back into it: header, 200 rows, footer, and then a screen more.
  const scrollTop = 44 + 200 * 36 + 60 + 1000;
  const windows = windowGroups(groups, scrollTop, VIEWPORT, METRICS);

  assert.equal(windows[0].lastIndex, -1, "the first group is behind us");
  assert.equal(windows[0].topSpacer, 200 * 36, "and is entirely spacer");
  assert.ok(windows[1].firstIndex > 0, "the second group starts partway in");
  assert.ok(windows[1].lastIndex > windows[1].firstIndex);
  assertHeightsAddUp(windows, groups);
});

test("the very end of a board renders its last rows", () => {
  const groups = [group(500)];
  const total = 44 + 500 * 36 + 60;
  const windows = windowGroups(groups, total - VIEWPORT, VIEWPORT, METRICS);

  assert.equal(windows[0].lastIndex, 499, "the final row is on screen");
  assert.equal(windows[0].bottomSpacer, 0);
  assertHeightsAddUp(windows, groups);
});

test("a collapsed group takes no rows and no spacers", () => {
  const groups = [group(300, true), group(10)];
  const windows = windowGroups(groups, 0, VIEWPORT, METRICS);
  assert.deepEqual(windows[0], { firstIndex: 0, lastIndex: -1, topSpacer: 0, bottomSpacer: 0 });
  assert.equal(windows[1].firstIndex, 0);
  assert.equal(windows[1].lastIndex, 9, "the group after it is fully visible");
});

test("an empty group is skipped without leaving a hole", () => {
  const groups = [group(0), group(4)];
  const windows = windowGroups(groups, 0, VIEWPORT, METRICS);
  assert.deepEqual(windows[0], { firstIndex: 0, lastIndex: -1, topSpacer: 0, bottomSpacer: 0 });
  assert.equal(windows[1].lastIndex, 3);
});

test("an empty group's note is counted, so later groups do not drift", () => {
  const withEmpty = [group(0), group(300)];
  const withoutEmpty = [group(1), group(300)];
  // A group showing one row and a group showing the empty note are the same
  // height, so the group after them starts in the same place.
  const a = windowGroups(withEmpty, 2000, VIEWPORT, METRICS)[1];
  const b = windowGroups(withoutEmpty, 2000, VIEWPORT, METRICS)[1];
  assert.deepEqual(a, b);
});

test("a window never runs past the rows a group has", () => {
  const groups = [group(3), group(2)];
  for (const scrollTop of [0, 50, 200, 5000]) {
    const windows = windowGroups(groups, scrollTop, VIEWPORT, METRICS);
    windows.forEach((w, i) => {
      assert.ok(w.firstIndex >= 0, `group ${i} first index`);
      assert.ok(w.lastIndex < groups[i].rowCount, `group ${i} last index at scroll ${scrollTop}`);
    });
  }
});

test("scrolling one row at a time never leaves a gap in what is rendered", () => {
  const groups = [group(400)];
  let previousLast = -1;
  for (let scrollTop = 0; scrollTop < 400 * 36; scrollTop += 36 * 5) {
    const [w] = windowGroups(groups, scrollTop, VIEWPORT, METRICS);
    assert.ok(
      w.firstIndex <= previousLast + 1,
      `a jump from ${previousLast} to ${w.firstIndex} would flash empty rows`,
    );
    previousLast = w.lastIndex;
    assertHeightsAddUp([w], groups);
  }
});

test("rows just above the viewport stay rendered, so scrolling back shows no gap", () => {
  const groups = [group(200), group(200)];
  // Just past the first group: its last rows are still within the overscan.
  const scrollTop = 44 + 200 * 36 + 60 + 100;
  const [first] = windowGroups(groups, scrollTop, VIEWPORT, METRICS);
  assert.equal(first.lastIndex, 199, "the group's final row is kept");
  assert.ok(first.firstIndex > 180, "but only its tail");
});

test("the rendered slice always covers the viewport itself", () => {
  const groups = [group(600)];
  const scrollTop = 4000;
  const [w] = windowGroups(groups, scrollTop, VIEWPORT, METRICS);
  const rowsTop = METRICS.headerHeight;
  const firstVisible = Math.floor((scrollTop - rowsTop) / METRICS.rowHeight);
  const lastVisible = Math.floor((scrollTop + VIEWPORT - rowsTop) / METRICS.rowHeight);
  assert.ok(w.firstIndex <= firstVisible, "nothing visible is missing above");
  assert.ok(w.lastIndex >= lastVisible, "nothing visible is missing below");
});
