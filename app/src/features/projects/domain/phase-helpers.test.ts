import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_PROJECT_PHASE, normaliseProjectPhase } from "./phase-helpers";

test("project phases use the canonical compact slash form", () => {
  assert.equal(DEFAULT_PROJECT_PHASE, "ETUDE/AP");
  assert.equal(normaliseProjectPhase("ETUDE / AP"), "ETUDE/AP");
  assert.equal(normaliseProjectPhase("  etude  /  ap  "), "ETUDE/AP");
  assert.equal(normaliseProjectPhase("EXE / DG / DV / 3D"), "EXE/DG/DV/3D");
});

test("unknown custom phases keep their casing while slash spacing is normalised", () => {
  assert.equal(normaliseProjectPhase("Design / Build"), "Design/Build");
});
