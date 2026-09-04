import assert from "node:assert/strict";
import test from "node:test";
import { nextProjectCode, sequenceOf } from "./next-project-code";

test("sequenceOf reads the sequence only for the year asked about", () => {
  assert.equal(sequenceOf("DBS-2026-007", 2026), 7);
  assert.equal(sequenceOf("DBS-2025-007", 2026), null);
  assert.equal(sequenceOf("dbs-2026-012", 2026), 12);
});

test("sequenceOf rejects anything that is not a house code", () => {
  assert.equal(sequenceOf("LE-SAILLEN", 2026), null);
  assert.equal(sequenceOf("DBS-2026", 2026), null);
  assert.equal(sequenceOf("DBS-2026-", 2026), null);
  assert.equal(sequenceOf("", 2026), null);
});

test("nextProjectCode starts a year at 001", () => {
  assert.equal(nextProjectCode(2026, []), "DBS-2026-001");
  assert.equal(nextProjectCode(2026, ["DBS-2025-004"]), "DBS-2026-001");
});

test("nextProjectCode continues from the highest, not the count", () => {
  // A deleted project leaves a gap; reusing it would collide with history.
  assert.equal(nextProjectCode(2026, ["DBS-2026-001", "DBS-2026-009"]), "DBS-2026-010");
});

test("nextProjectCode ignores codes it does not recognise", () => {
  assert.equal(nextProjectCode(2026, ["LE-SAILLEN", "DBS-2026-002"]), "DBS-2026-003");
});

test("nextProjectCode widens past 999 rather than wrapping", () => {
  assert.equal(nextProjectCode(2026, ["DBS-2026-999"]), "DBS-2026-1000");
});
