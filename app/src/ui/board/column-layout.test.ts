import assert from "node:assert/strict";
import test from "node:test";
import type { BoardColumn } from "./columns";
import {
  applyView,
  EMPTY_VIEW,
  MAX_COLUMN_WIDTH,
  MIN_COLUMN_WIDTH,
  moveColumn,
  orderedKeys,
  reorderColumn,
  resetColumnWidth,
  setColumnWidth,
  toggleHidden,
} from "./view-state";

const COLUMNS: BoardColumn[] = [
  { key: "status", label: "Status", kind: "status", width: 130, options: ["todo"] },
  { key: "client", label: "Client", kind: "text", width: 160 },
  { key: "year", label: "Year", kind: "number", width: 80 },
];

test("with no explicit order the board's own order stands", () => {
  assert.deepEqual(orderedKeys(COLUMNS, EMPTY_VIEW), ["status", "client", "year"]);
});

test("moveColumn shifts one place and stops at the ends", () => {
  let view = moveColumn(EMPTY_VIEW, COLUMNS, "year", "left");
  assert.deepEqual(orderedKeys(COLUMNS, view), ["status", "year", "client"]);
  view = moveColumn(view, COLUMNS, "status", "left");
  assert.deepEqual(orderedKeys(COLUMNS, view), ["status", "year", "client"], "already leftmost");
  view = moveColumn(view, COLUMNS, "client", "right");
  assert.deepEqual(orderedKeys(COLUMNS, view), ["status", "year", "client"], "already rightmost");
});

test("moveColumn ignores a column the board does not have", () => {
  assert.equal(moveColumn(EMPTY_VIEW, COLUMNS, "ghost", "left"), EMPTY_VIEW);
});

test("reorderColumn drops one column immediately before another", () => {
  const view = reorderColumn(EMPTY_VIEW, COLUMNS, "year", "client");
  assert.deepEqual(orderedKeys(COLUMNS, view), ["status", "year", "client"]);
});

test("reorderColumn to the far left and far right both work", () => {
  const left = reorderColumn(EMPTY_VIEW, COLUMNS, "year", "status");
  assert.deepEqual(orderedKeys(COLUMNS, left), ["year", "status", "client"]);
  const back = reorderColumn(left, COLUMNS, "year", "client");
  assert.deepEqual(orderedKeys(COLUMNS, back), ["status", "year", "client"]);
});

test("reorderColumn onto itself changes nothing", () => {
  assert.equal(reorderColumn(EMPTY_VIEW, COLUMNS, "year", "year"), EMPTY_VIEW);
});

/**
 * A column added to the board later must not disturb an arrangement someone
 * already made, and a column removed from the board must not leave a hole.
 */
test("an order survives the board gaining and losing columns", () => {
  const view = reorderColumn(EMPTY_VIEW, COLUMNS, "year", "status");
  const withNew: BoardColumn[] = [...COLUMNS, { key: "commune", label: "Commune", kind: "text", width: 140 }];
  assert.deepEqual(orderedKeys(withNew, view), ["year", "status", "client", "commune"]);

  const withoutClient = withNew.filter((c) => c.key !== "client");
  assert.deepEqual(orderedKeys(withoutClient, view), ["year", "status", "commune"]);
});

test("a width override reaches the rendered column and can be taken back", () => {
  let view = setColumnWidth(EMPTY_VIEW, "client", 240);
  assert.equal(applyView([], COLUMNS, view).columns.find((c) => c.key === "client")?.width, 240);
  view = resetColumnWidth(view, "client");
  assert.equal(applyView([], COLUMNS, view).columns.find((c) => c.key === "client")?.width, 160);
});

test("widths are clamped and rounded, so a column cannot be dragged to nothing", () => {
  assert.equal(setColumnWidth(EMPTY_VIEW, "client", 5).widths.client, MIN_COLUMN_WIDTH);
  assert.equal(setColumnWidth(EMPTY_VIEW, "client", 99_999).widths.client, MAX_COLUMN_WIDTH);
  assert.equal(setColumnWidth(EMPTY_VIEW, "client", 200.6).widths.client, 201);
});

test("order, hiding and width compose", () => {
  let view = reorderColumn(EMPTY_VIEW, COLUMNS, "year", "status");
  view = toggleHidden(view, "client");
  view = setColumnWidth(view, "year", 120);
  const { columns } = applyView([], COLUMNS, view);
  assert.deepEqual(columns.map((c) => c.key), ["year", "status"]);
  assert.equal(columns[0].width, 120);
});

test("applyView does not mutate the columns it is given", () => {
  const view = setColumnWidth(EMPTY_VIEW, "client", 240);
  applyView([], COLUMNS, view);
  assert.equal(COLUMNS.find((c) => c.key === "client")?.width, 160);
});
