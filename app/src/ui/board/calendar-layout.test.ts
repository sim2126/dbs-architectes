import assert from "node:assert/strict";
import test from "node:test";
import {
  addMonths,
  itemSpan,
  layoutWeek,
  monthGrid,
  parseDayValue,
  startOfMonth,
  toDayValue,
  localDay,
  millisecondsUntilTomorrow,
  formatDay,
} from "./calendar-layout";

const day = (iso: string) => parseDayValue(iso)!;

test("today follows local dates and refreshes at the next local midnight", () => {
  const now = new Date(2026, 8, 5, 0, 15);
  assert.equal(toDayValue(localDay(now)), "2026-09-05");
  const midnight = new Date(now.getTime() + millisecondsUntilTomorrow(now));
  assert.equal(midnight.getDate(), 6);
  assert.equal(midnight.getHours(), 0);
  assert.equal(midnight.getMinutes(), 0);
  assert.equal(formatDay(day("2026-09-05")), "5 Sept 2026");
});

// ── The grid ─────────────────────────────────────────────────────────────────

test("every week is seven days and starts on a Monday", () => {
  for (const month of ["2026-01-01", "2026-02-01", "2026-09-01", "2027-03-01"]) {
    for (const week of monthGrid(day(month))) {
      assert.equal(week.length, 7, month);
      assert.equal(week[0].getUTCDay(), 1, `${month} starts Monday`);
    }
  }
});

test("the grid covers every day of the month and nothing is skipped", () => {
  const grid = monthGrid(day("2026-09-15"));
  const days = grid.flat();
  const inMonth = days.filter((d) => d.getUTCMonth() === 8);
  assert.equal(inMonth.length, 30, "September has 30 days");
  for (let i = 1; i < days.length; i++) {
    assert.equal(days[i].getTime() - days[i - 1].getTime(), 86_400_000, "consecutive");
  }
});

test("a month beginning on a Sunday still gets a full leading week", () => {
  // 1 February 2026 is a Sunday.
  const grid = monthGrid(day("2026-02-01"));
  assert.equal(grid[0][0].getUTCDate(), 26, "starts Monday 26 January");
  assert.ok(grid.flat().some((d) => d.getUTCDate() === 1 && d.getUTCMonth() === 1));
});

test("February in a leap year has its 29th", () => {
  const days = monthGrid(day("2028-02-10")).flat();
  assert.ok(days.some((d) => d.getUTCMonth() === 1 && d.getUTCDate() === 29));
});

test("month arithmetic crosses a year boundary", () => {
  assert.equal(toDayValue(addMonths(day("2026-12-15"), 1)), "2027-01-01");
  assert.equal(toDayValue(addMonths(day("2026-01-15"), -1)), "2025-12-01");
  assert.equal(toDayValue(startOfMonth(day("2026-09-30"))), "2026-09-01");
});

test("a grid spanning a spring clock change keeps whole days", () => {
  // Europe changes clocks on 29 March 2026; UTC midnights are unaffected.
  const days = monthGrid(day("2026-03-15")).flat();
  for (let i = 1; i < days.length; i++) {
    assert.equal(days[i].getTime() - days[i - 1].getTime(), 86_400_000);
  }
});

// ── Laying a week out ────────────────────────────────────────────────────────

const WEEK = monthGrid(day("2026-09-15"))[2]; // Monday 14 to Sunday 20 September

test("a single-day item takes one column in the top lane", () => {
  const [segment] = layoutWeek(WEEK, [{ id: "a", start: day("2026-09-16"), end: day("2026-09-16") }]);
  // 16 September 2026 is the Wednesday of this week: Monday is column 0.
  assert.deepEqual(segment, {
    id: "a",
    startCol: 2,
    span: 1,
    lane: 0,
    continuesBefore: false,
    continuesAfter: false,
  });
});

test("items that do not overlap share the top lane", () => {
  const segments = layoutWeek(WEEK, [
    { id: "a", start: day("2026-09-14"), end: day("2026-09-15") },
    { id: "b", start: day("2026-09-17"), end: day("2026-09-18") },
  ]);
  assert.deepEqual(segments.map((s) => s.lane), [0, 0]);
});

test("items that overlap are stacked, longest on top", () => {
  const segments = layoutWeek(WEEK, [
    { id: "short", start: day("2026-09-16"), end: day("2026-09-16") },
    { id: "long", start: day("2026-09-14"), end: day("2026-09-20") },
  ]);
  const byId = Object.fromEntries(segments.map((s) => [s.id, s]));
  assert.equal(byId.long.lane, 0, "the week-long one takes the top lane");
  assert.equal(byId.short.lane, 1);
});

test("an item longer than the week is clamped and says so", () => {
  const [segment] = layoutWeek(WEEK, [{ id: "a", start: day("2026-08-01"), end: day("2026-12-31") }]);
  assert.equal(segment.startCol, 0);
  assert.equal(segment.span, 7);
  assert.equal(segment.continuesBefore, true);
  assert.equal(segment.continuesAfter, true);
});

test("an item that ends inside the week does not claim the rest of it", () => {
  const [segment] = layoutWeek(WEEK, [{ id: "a", start: day("2026-09-01"), end: day("2026-09-16") }]);
  assert.equal(segment.startCol, 0);
  assert.equal(segment.span, 3);
  assert.equal(segment.continuesBefore, true);
  assert.equal(segment.continuesAfter, false);
});

test("an item outside the week is not drawn at all", () => {
  assert.deepEqual(layoutWeek(WEEK, [{ id: "a", start: day("2026-10-01"), end: day("2026-10-02") }]), []);
  assert.deepEqual(layoutWeek(WEEK, [{ id: "b", start: day("2026-09-01"), end: day("2026-09-02") }]), []);
});

test("the layout is the same however the items arrive", () => {
  const items = [
    { id: "a", start: day("2026-09-14"), end: day("2026-09-16") },
    { id: "b", start: day("2026-09-15"), end: day("2026-09-17") },
    { id: "c", start: day("2026-09-14"), end: day("2026-09-20") },
  ];
  const forward = layoutWeek(WEEK, items);
  const backward = layoutWeek(WEEK, [...items].reverse());
  assert.deepEqual(forward, backward);
});

test("an empty week lays out nothing", () => {
  assert.deepEqual(layoutWeek([], [{ id: "a", start: day("2026-09-14"), end: day("2026-09-14") }]), []);
});

// ── Reading and writing days ─────────────────────────────────────────────────

test("a day parses from both shapes the app produces", () => {
  assert.equal(toDayValue(parseDayValue("2026-09-04")!), "2026-09-04");
  assert.equal(toDayValue(parseDayValue("2026-09-04T13:45:12.000Z")!), "2026-09-04");
  assert.equal(toDayValue(parseDayValue(new Date("2026-09-04T22:00:00.000Z"))!), "2026-09-04");
});

test("anything that is not a day is refused rather than becoming Invalid Date", () => {
  for (const bad of ["", "tomorrow", "04/09/2026", "2026-13-01", "2026-02-31", null, 42, {}, new Date("nope")]) {
    assert.equal(parseDayValue(bad), null, JSON.stringify(bad));
  }
});

test("itemSpan handles one date, two dates, none, and a backwards pair", () => {
  assert.equal(itemSpan(null, null), null);
  const onlyStart = itemSpan(day("2026-09-04"), null)!;
  assert.equal(toDayValue(onlyStart.start), "2026-09-04");
  assert.equal(toDayValue(onlyStart.end), "2026-09-04", "a start alone is one day, not the rest of time");

  const onlyEnd = itemSpan(null, day("2026-09-04"))!;
  assert.equal(toDayValue(onlyEnd.start), "2026-09-04");

  const backwards = itemSpan(day("2026-09-10"), day("2026-09-04"))!;
  assert.equal(toDayValue(backwards.start), "2026-09-04", "a typo is drawn, not discarded");
  assert.equal(toDayValue(backwards.end), "2026-09-10");
});
