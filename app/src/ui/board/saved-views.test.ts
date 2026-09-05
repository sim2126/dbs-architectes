import assert from "node:assert/strict";
import test from "node:test";
import type { BoardColumn } from "./columns";
import {
  describeView,
  MAX_VIEW_NAME,
  normaliseViewName,
  parseSavedViewState,
} from "./saved-views";
import { EMPTY_VIEW, MAX_COLUMN_WIDTH, MIN_COLUMN_WIDTH } from "./view-state";

const COLUMNS: BoardColumn[] = [
  { key: "workStatus", label: "Status", kind: "status", width: 130, options: ["todo", "doing"] },
  { key: "phase", label: "Phase", kind: "status", width: 148, options: ["ETUDE/AP"] },
  { key: "client", label: "Client", kind: "text", width: 160 },
];

test("a complete view round-trips", () => {
  const stored = {
    view: {
      values: { workStatus: ["doing"] },
      people: ["u1"],
      sort: { key: "client", direction: "asc" },
      hidden: ["phase"],
      widths: { client: 220 },
      order: ["client", "workStatus"],
    },
    layout: "kanban",
    groupBy: "workStatus",
  };
  const parsed = parseSavedViewState(stored, "phase");
  assert.deepEqual(parsed, {
    view: {
      values: { workStatus: ["doing"] },
      people: ["u1"],
      sort: { key: "client", direction: "asc" },
      hidden: ["phase"],
      widths: { client: 220 },
      order: ["client", "workStatus"],
    },
    layout: "kanban",
    groupBy: "workStatus",
  });
});

test("nothing usable gives null rather than a broken board", () => {
  for (const bad of [null, undefined, 42, "view", [], {}, { view: null }, { view: [] }]) {
    assert.equal(parseSavedViewState(bad, "phase"), null, JSON.stringify(bad));
  }
});

test("a half-written view fills in from the empty view", () => {
  const parsed = parseSavedViewState({ view: {} }, "phase");
  assert.deepEqual(parsed, { view: EMPTY_VIEW, layout: "table", groupBy: "phase" });
});

test("values of the wrong type are dropped, not coerced", () => {
  const parsed = parseSavedViewState(
    {
      view: {
        values: { workStatus: ["doing", 7, null], phase: "not-an-array", empty: [] },
        people: ["u1", 3],
        hidden: [{ key: "x" }, "phase"],
        order: "client",
      },
    },
    "phase",
  );
  assert.deepEqual(parsed!.view.values, { workStatus: ["doing"] }, "empty and non-array keys go");
  assert.deepEqual(parsed!.view.people, ["u1"]);
  assert.deepEqual(parsed!.view.hidden, ["phase"]);
  assert.deepEqual(parsed!.view.order, []);
});

test("a malformed sort becomes no sort", () => {
  for (const sort of [{ key: "client" }, { key: 1, direction: "asc" }, { key: "c", direction: "sideways" }, "asc"]) {
    assert.equal(parseSavedViewState({ view: { sort } }, "phase")!.view.sort, null);
  }
});

test("stored widths are clamped, so a saved view cannot hide a column by width", () => {
  const parsed = parseSavedViewState(
    { view: { widths: { client: 1, phase: 99_999, workStatus: "wide", bad: Number.NaN } } },
    "phase",
  );
  assert.deepEqual(parsed!.view.widths, { client: MIN_COLUMN_WIDTH, phase: MAX_COLUMN_WIDTH });
});

test("an unknown layout falls back to the table", () => {
  assert.equal(parseSavedViewState({ view: {}, layout: "calendar" }, "phase")!.layout, "table");
  assert.equal(parseSavedViewState({ view: {}, layout: "kanban" }, "phase")!.layout, "kanban");
});

test("names are trimmed, collapsed and bounded", () => {
  assert.equal(normaliseViewName("  My   Valais  sites "), "My Valais sites");
  assert.equal(normaliseViewName("   "), "");
  assert.equal(normaliseViewName("x".repeat(200)).length, MAX_VIEW_NAME);
});

test("describeView says what the view actually does", () => {
  const state = parseSavedViewState(
    {
      view: {
        values: { workStatus: ["doing"] },
        people: ["u1"],
        sort: { key: "client", direction: "asc" },
        hidden: ["phase"],
      },
      layout: "kanban",
      groupBy: "workStatus",
    },
    "phase",
  )!;
  assert.equal(
    describeView(state, COLUMNS),
    "Kanban · 2 filters · sorted by Client · 1 hidden · grouped by Status",
  );
});

test("describeView on a plain view is short, and names a column it does not know", () => {
  const state = parseSavedViewState({ view: {}, groupBy: "country" }, "phase")!;
  assert.equal(describeView(state, COLUMNS), "Table · grouped by country");
});
