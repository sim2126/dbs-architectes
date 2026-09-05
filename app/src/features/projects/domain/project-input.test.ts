import assert from "node:assert/strict";
import test from "node:test";
import {
  parseProjectDate, parseProjectYear, parseProjectCoordinate, ProjectInputError,
  requireProjectObject, validateProjectDateRange, validateProjectValues,
} from "./project-input";

test("project dates reject rollovers, malformed types and invalid timestamps", () => {
  for (const value of ["2026-02-31", "2026-02-29", "2026-04-31", "2026-13-01", "01/02/2026",
    "2026-01-01T24:00:00Z", "2026-01-01T10:00:00+02:00", "tomorrow", 2026, {}, [], undefined, new Date("invalid")]) {
    assert.throws(() => parseProjectDate(value, "Start date"), ProjectInputError, String(value));
  }
  assert.equal(parseProjectDate("2028-02-29", "Start date")?.toISOString(), "2028-02-29T00:00:00.000Z");
  assert.equal(parseProjectDate("2026-05-04T10:30:00.000Z", "Start date")?.toISOString(), "2026-05-04T10:30:00.000Z");
  assert.equal(parseProjectDate("", "Start date"), null);
  assert.equal(parseProjectDate(null, "Start date"), null);
});

test("project date ranges reject reversed endpoints while allowing clear and same day", () => {
  const start = new Date("2026-05-04");
  const end = new Date("2026-05-05");
  validateProjectDateRange(start, end);
  validateProjectDateRange(start, start);
  validateProjectDateRange(null, end);
  validateProjectDateRange(start, null);
  assert.throws(() => validateProjectDateRange(end, start), /Start date must be/);
});

test("year input preserves integers and rejects invalid values before persistence", () => {
  assert.equal(parseProjectYear("2027"), 2027);
  assert.equal(parseProjectYear(2027), 2027);
  assert.equal(parseProjectYear(null), null);
  assert.equal(parseProjectYear(""), null);
  for (const value of ["2027oops", "2027.5", 2027.5, "202", {}, [], NaN]) {
    assert.throws(() => parseProjectYear(value), ProjectInputError);
  }
});

test("creation validates title, status and coordinates without silently coercing objects", () => {
  validateProjectValues({ title: "Test project", workStatus: "stuck" }, true);
  assert.throws(() => validateProjectValues({}, true), /title is required/);
  assert.throws(() => validateProjectValues({ title: "  " }, true), ProjectInputError);
  assert.throws(() => validateProjectValues({ workStatus: "finished" }), ProjectInputError);
  assert.throws(() => validateProjectValues({ notes: {} }), ProjectInputError);
  assert.equal(parseProjectCoordinate("46.2", "latitude"), 46.2);
  assert.equal(parseProjectCoordinate(null, "longitude"), null);
  for (const value of ["46oops", 91, {}, false]) assert.throws(() => parseProjectCoordinate(value, "latitude"), ProjectInputError);
  for (const value of [null, [], "text", 42]) assert.throws(() => requireProjectObject(value), ProjectInputError);
});
