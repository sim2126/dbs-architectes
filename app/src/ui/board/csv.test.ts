import assert from "node:assert/strict";
import test from "node:test";
import { csvCell } from "./csv";

test("formula prefixes remain text even behind tabs and line breaks", () => {
  for (const prefix of ["", "\t", "\r", "\n", " \t\r\n", "\u0000"]) {
    for (const formula of ["=1+1", "+1", "-2", "@SUM(1)"]) {
      assert.equal(csvCell(prefix + formula), `"'${prefix}${formula}"`);
    }
  }
});

test("ordinary CSV values retain whitespace, quotes and line breaks", () => {
  assert.equal(csvCell('line 1\n"line 2",'), '"line 1\n""line 2"","');
  assert.equal(csvCell("  Example "), '"  Example "');
  assert.equal(csvCell(null), '""');
});
