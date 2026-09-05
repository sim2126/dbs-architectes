import assert from "node:assert/strict";
import test from "node:test";
import type { BoardColumn, BoardRow } from "./columns";
import {
  activeFilterCount,
  applyView,
  clearFilters,
  cycleSort,
  EMPTY_VIEW,
  isFiltered,
  selectedValues,
  toggleFilterValue,
  toggleHidden,
  togglePerson,
} from "./view-state";

const STATUS: BoardColumn = {
  key: "workStatus",
  label: "Status",
  kind: "status",
  width: 130,
  options: ["todo", "doing", "stuck", "completed"],
};
const CLIENT: BoardColumn = { key: "client", label: "Client", kind: "text", width: 160 };
const YEAR: BoardColumn = { key: "year", label: "Year", kind: "number", width: 80 };
const TEAM: BoardColumn = { key: "people", label: "Team", kind: "people", width: 120 };
const COLUMNS = [STATUS, CLIENT, YEAR, TEAM];

function row(
  id: string,
  cells: Record<string, string | number | null>,
  people: string[] = [],
): BoardRow {
  return {
    id,
    title: id,
    cells,
    people: people.map((p) => ({ id: p, name: p, initials: p.slice(0, 2) })),
  };
}

// ── Filters ──────────────────────────────────────────────────────────────────

test("a filter with nothing chosen constrains nothing", () => {
  let view = toggleFilterValue(EMPTY_VIEW, "workStatus", "stuck");
  assert.equal(activeFilterCount(view), 1);
  view = toggleFilterValue(view, "workStatus", "stuck");
  assert.equal(activeFilterCount(view), 0);
  assert.equal(isFiltered(view), false);
  assert.deepEqual(view.values, {}, "the key is dropped, not left empty");
});

test("retired filter keys do not hide rows and duplicate orders render once", () => {
  const rows = [row("a", { client: "Example" })];
  const result = applyView(rows, COLUMNS, {
    ...EMPTY_VIEW,
    values: { retired: ["anything"] },
    order: ["client", "client", "retired"],
  });
  assert.deepEqual(result.rows.map((item) => item.id), ["a"]);
  assert.deepEqual(result.columns.map((column) => column.key), ["client", "workStatus", "year", "people"]);
});

test("filter values accumulate and are read back", () => {
  let view = toggleFilterValue(EMPTY_VIEW, "workStatus", "stuck");
  view = toggleFilterValue(view, "workStatus", "doing");
  assert.deepEqual(selectedValues(view, "workStatus"), ["stuck", "doing"]);
  assert.deepEqual(selectedValues(view, "client"), []);
});

test("filtering keeps rows whose value is among those chosen", () => {
  const rows = [
    row("a", { workStatus: "stuck" }),
    row("b", { workStatus: "doing" }),
    row("c", { workStatus: "todo" }),
  ];
  const view = toggleFilterValue(toggleFilterValue(EMPTY_VIEW, "workStatus", "stuck"), "workStatus", "todo");
  assert.deepEqual(applyView(rows, COLUMNS, view).rows.map((r) => r.id), ["a", "c"]);
});

test("filters on different columns are combined, not alternated", () => {
  const rows = [
    row("a", { workStatus: "stuck", client: "X" }),
    row("b", { workStatus: "stuck", client: "Y" }),
  ];
  let view = toggleFilterValue(EMPTY_VIEW, "workStatus", "stuck");
  view = toggleFilterValue(view, "client", "Y");
  assert.equal(activeFilterCount(view), 2);
  assert.deepEqual(applyView(rows, COLUMNS, view).rows.map((r) => r.id), ["b"]);
});

test("a filter can select rows with no value at all", () => {
  const rows = [row("a", { client: "X" }), row("b", { client: null })];
  const view = toggleFilterValue(EMPTY_VIEW, "client", "");
  assert.deepEqual(applyView(rows, COLUMNS, view).rows.map((r) => r.id), ["b"]);
});

test("the person filter keeps rows that include any of the chosen people", () => {
  const rows = [row("a", {}, ["u1"]), row("b", {}, ["u2", "u3"]), row("c", {})];
  let view = togglePerson(EMPTY_VIEW, "u1");
  assert.deepEqual(applyView(rows, COLUMNS, view).rows.map((r) => r.id), ["a"]);
  view = togglePerson(view, "u3");
  assert.deepEqual(applyView(rows, COLUMNS, view).rows.map((r) => r.id), ["a", "b"]);
  assert.equal(activeFilterCount(view), 1, "people are one filter however many are chosen");
});

test("clearFilters leaves sorting and hidden columns alone", () => {
  let view = toggleFilterValue(EMPTY_VIEW, "workStatus", "stuck");
  view = togglePerson(view, "u1");
  view = cycleSort(view, "client");
  view = toggleHidden(view, "year");
  const cleared = clearFilters(view);
  assert.equal(isFiltered(cleared), false);
  assert.deepEqual(cleared.sort, { key: "client", direction: "asc" });
  assert.deepEqual(cleared.hidden, ["year"]);
});

// ── Hiding ───────────────────────────────────────────────────────────────────

test("a hidden column leaves the board and comes back", () => {
  let view = toggleHidden(EMPTY_VIEW, "year");
  assert.deepEqual(applyView([], COLUMNS, view).columns.map((c) => c.key), [
    "workStatus",
    "client",
    "people",
  ]);
  view = toggleHidden(view, "year");
  assert.equal(applyView([], COLUMNS, view).columns.length, 4);
});

// ── Sorting ──────────────────────────────────────────────────────────────────

test("cycleSort goes ascending, descending, off", () => {
  let view = cycleSort(EMPTY_VIEW, "client");
  assert.deepEqual(view.sort, { key: "client", direction: "asc" });
  view = cycleSort(view, "client");
  assert.deepEqual(view.sort, { key: "client", direction: "desc" });
  view = cycleSort(view, "client");
  assert.equal(view.sort, null);
});

test("cycleSort on a different column starts that column ascending", () => {
  const view = cycleSort(cycleSort(EMPTY_VIEW, "client"), "year");
  assert.deepEqual(view.sort, { key: "year", direction: "asc" });
});

test("a status column sorts in its declared order, not alphabetically", () => {
  const rows = [
    row("done", { workStatus: "completed" }),
    row("stuck", { workStatus: "stuck" }),
    row("todo", { workStatus: "todo" }),
  ];
  const view = cycleSort(EMPTY_VIEW, "workStatus");
  assert.deepEqual(applyView(rows, COLUMNS, view).rows.map((r) => r.id), ["todo", "stuck", "done"]);
});

test("numbers sort numerically, not as text", () => {
  const rows = [row("a", { year: 2009 }), row("b", { year: 1998 }), row("c", { year: 2024 })];
  const view = cycleSort(EMPTY_VIEW, "year");
  assert.deepEqual(applyView(rows, COLUMNS, view).rows.map((r) => r.id), ["b", "a", "c"]);
});

test("text sorts case- and accent-insensitively", () => {
  const rows = [row("a", { client: "zeta" }), row("b", { client: "Éclair" }), row("c", { client: "alpha" })];
  const view = cycleSort(EMPTY_VIEW, "client");
  assert.deepEqual(applyView(rows, COLUMNS, view).rows.map((r) => r.id), ["c", "b", "a"]);
});

test("empty values sort last in both directions", () => {
  const rows = [row("a", { client: null }), row("b", { client: "M" }), row("c", { client: "A" })];
  const asc = cycleSort(EMPTY_VIEW, "client");
  assert.deepEqual(applyView(rows, COLUMNS, asc).rows.map((r) => r.id), ["c", "b", "a"]);
  const desc = cycleSort(asc, "client");
  assert.deepEqual(
    applyView(rows, COLUMNS, desc).rows.map((r) => r.id),
    ["b", "c", "a"],
    "M before A, and the blank still last",
  );
});

test("a people column sorts by how many are assigned", () => {
  const rows = [row("a", {}, ["u1"]), row("b", {}), row("c", {}, ["u1", "u2"])];
  const view = cycleSort(EMPTY_VIEW, "people");
  assert.deepEqual(applyView(rows, COLUMNS, view).rows.map((r) => r.id), ["c", "a", "b"]);
});

test("sorting on a column that is not on the board is ignored", () => {
  const rows = [row("a", {}), row("b", {})];
  const view = { ...EMPTY_VIEW, sort: { key: "nonexistent", direction: "asc" as const } };
  assert.deepEqual(applyView(rows, COLUMNS, view).rows.map((r) => r.id), ["a", "b"]);
});

test("applyView does not mutate the rows it is given", () => {
  const rows = [row("b", { client: "B" }), row("a", { client: "A" })];
  applyView(rows, COLUMNS, cycleSort(EMPTY_VIEW, "client"));
  assert.deepEqual(rows.map((r) => r.id), ["b", "a"]);
});
