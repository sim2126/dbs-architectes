import assert from "node:assert/strict";
import test from "node:test";
import type { BoardColumn, BoardRow } from "./columns";
import { columnSummary, groupRows, statusDistribution } from "./grouping";

const PHASE: BoardColumn = {
  key: "phase",
  label: "Phase",
  kind: "status",
  width: 140,
  options: ["ETUDE/AP", "CHANTIER", "TERMINATO"],
  colorFor: (v) => `color-${v}`,
  labelFor: (v) => `Phase ${v}`,
};

const STATUS: BoardColumn = {
  key: "workStatus",
  label: "Status",
  kind: "status",
  width: 130,
  options: ["todo", "doing", "stuck", "completed"],
  colorFor: (v) => `color-${v}`,
};

function row(id: string, cells: Record<string, string | number | null>, people: string[] = []): BoardRow {
  return {
    id,
    title: `Project ${id}`,
    cells,
    people: people.map((p) => ({ id: p, name: p, initials: p.slice(0, 2) })),
  };
}

test("groupRows keeps the column's declared order and shows empty groups", () => {
  const groups = groupRows(
    [row("a", { phase: "CHANTIER" }), row("b", { phase: "ETUDE/AP" })],
    PHASE,
  );
  assert.deepEqual(groups.map((g) => g.value), ["ETUDE/AP", "CHANTIER", "TERMINATO"]);
  assert.deepEqual(groups.map((g) => g.rows.length), [1, 1, 0]);
  assert.equal(groups[0].label, "Phase ETUDE/AP");
  assert.equal(groups[0].color, "color-ETUDE/AP");
});

test("groupRows never drops a row with an unknown or missing value", () => {
  const groups = groupRows(
    [row("a", { phase: "DEMOLITION" }), row("b", { phase: null }), row("c", { phase: "" }), row("d", { phase: "CHANTIER" })],
    PHASE,
  );
  const ungrouped = groups[groups.length - 1];
  assert.equal(ungrouped.value, null);
  assert.equal(ungrouped.label, "Ungrouped");
  assert.deepEqual(ungrouped.rows.map((r) => r.id), ["a", "b", "c"]);
  const total = groups.reduce((sum, g) => sum + g.rows.length, 0);
  assert.equal(total, 4, "every row appears exactly once");
});

test("groupRows omits the ungrouped bucket when nothing needs it", () => {
  const groups = groupRows([row("a", { phase: "CHANTIER" })], PHASE);
  assert.equal(groups.length, 3);
  assert.ok(groups.every((g) => g.value !== null));
});

test("statusDistribution percentages always total 100", () => {
  const segments = statusDistribution(
    [
      row("a", { workStatus: "todo" }),
      row("b", { workStatus: "doing" }),
      row("c", { workStatus: "doing" }),
    ],
    STATUS,
  );
  assert.equal(segments.reduce((sum, s) => sum + s.percent, 0), 100);
  assert.deepEqual(segments.map((s) => s.value), ["todo", "doing"]);
  assert.deepEqual(segments.map((s) => s.count), [1, 2]);
  // The remainder goes to the largest segment, not the first.
  assert.equal(segments[1].percent, 67);
});

test("statusDistribution totals 100 for an awkward three-way split", () => {
  const segments = statusDistribution(
    [
      row("a", { workStatus: "todo" }),
      row("b", { workStatus: "doing" }),
      row("c", { workStatus: "stuck" }),
    ],
    STATUS,
  );
  assert.equal(segments.reduce((sum, s) => sum + s.percent, 0), 100);
});

test("statusDistribution names a missing value rather than hiding it", () => {
  const segments = statusDistribution([row("a", { workStatus: null })], STATUS);
  assert.equal(segments.length, 1);
  assert.equal(segments[0].label, "Not set");
  assert.equal(segments[0].percent, 100);
});

test("statusDistribution is empty for an empty group", () => {
  assert.deepEqual(statusDistribution([], STATUS), []);
});

test("columnSummary reports a year span, not a nonsensical sum", () => {
  const year: BoardColumn = { key: "year", label: "Year", kind: "number", width: 90 };
  assert.equal(columnSummary([row("a", { year: 2025 }), row("b", { year: 2026 })], year), "2025–2026");
  assert.equal(columnSummary([row("a", { year: 2026 })], year), "2026");
});

test("columnSummary sums a genuine number column", () => {
  const area: BoardColumn = { key: "area", label: "Area", kind: "number", width: 90 };
  assert.equal(columnSummary([row("a", { area: 120 }), row("b", { area: 80 })], area), "200");
});

test("columnSummary counts staffing on a people column", () => {
  const people: BoardColumn = { key: "people", label: "Team", kind: "people", width: 140 };
  assert.equal(columnSummary([row("a", {}, ["u1"]), row("b", {})], people), "1/2 staffed");
  assert.equal(columnSummary([row("a", {}, ["u1"])], people), "All staffed");
});

test("columnSummary only speaks up about text when something is missing", () => {
  const client: BoardColumn = { key: "client", label: "Client", kind: "text", width: 180 };
  assert.equal(columnSummary([row("a", { client: "X" }), row("b", { client: "Y" })], client), "");
  assert.equal(columnSummary([row("a", { client: "X" }), row("b", { client: null })], client), "1 empty");
  assert.equal(columnSummary([row("a", { client: null })], client), "Empty");
  assert.equal(columnSummary([], client), "");
});
