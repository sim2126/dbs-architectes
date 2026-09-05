import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCellPayload,
  columnFor,
  PROJECT_COLUMNS,
  validateCell,
} from "./editable-columns";

test("every column the editor exposes has a unique field name", () => {
  // The Sheets data-loss bug was a payload naming a subset of the exposed
  // fields. A duplicate field here would silently shadow one column's edits.
  const fields = PROJECT_COLUMNS.map((c) => c.field);
  assert.equal(new Set(fields).size, fields.length);
});

test("select columns always carry their options", () => {
  for (const c of PROJECT_COLUMNS) {
    if (c.kind === "select") {
      assert.ok(
        c.options && c.options.length > 0,
        `${c.field} is a select with no options — it would render an empty menu`,
      );
    }
  }
});

test("empty clears an optional field to null, not empty string", () => {
  const client = columnFor("client")!;
  assert.deepEqual(validateCell(client, "   "), { ok: true, value: null });
});

test("empty is rejected on a required field", () => {
  const title = columnFor("title")!;
  const result = validateCell(title, "  ");
  assert.equal(result.ok, false);
});

test("select rejects a value outside its options", () => {
  const phase = columnFor("phase")!;
  assert.equal(validateCell(phase, "NOT_A_PHASE").ok, false);
  assert.equal(validateCell(phase, PROJECT_COLUMNS[1].options![0]).ok, true);
});

test("number rejects non-numeric and implausible years", () => {
  const year = columnFor("year")!;
  assert.equal(validateCell(year, "abc").ok, false);
  assert.equal(validateCell(year, "2026.5").ok, false, "Prisma years must be integers");
  assert.equal(validateCell(year, "202").ok, false, "three digits is a typo");
  assert.equal(validateCell(year, "20255").ok, false, "five digits is a typo");
  assert.deepEqual(validateCell(year, "2026"), { ok: true, value: 2026 });
});

test("values are trimmed before saving", () => {
  const client = columnFor("client")!;
  assert.deepEqual(validateCell(client, "  Commune de Sion  "), {
    ok: true,
    value: "Commune de Sion",
  });
});

test("the payload names exactly one field", () => {
  const result = buildCellPayload("client", "Commune de Sion");
  assert.ok(result.ok);
  if (result.ok) {
    assert.deepEqual(Object.keys(result.payload), ["client"]);
  }
});

test("an unknown column cannot produce a payload", () => {
  // Closed-world: a typo in a field name must fail loudly rather than
  // write an unrecognised key the API would ignore.
  const result = buildCellPayload("notAField", "x");
  assert.equal(result.ok, false);
});

test("a rejected value never produces a payload", () => {
  const result = buildCellPayload("year", "abc");
  assert.equal(result.ok, false);
});
