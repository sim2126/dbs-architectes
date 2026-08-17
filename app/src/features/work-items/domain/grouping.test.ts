import assert from "node:assert/strict";
import test from "node:test";
import { bucketFor, groupByTime, type BucketableItem } from "./grouping";

// Fixed clock. Wednesday 12 August 2026, mid-morning.
const NOW = new Date("2026-08-12T10:00:00.000Z");

function item(partial: Partial<BucketableItem> & { id: string }): BucketableItem {
  return { dueDate: null, startDate: null, status: "todo", ...partial };
}

test("buckets by due date relative to today", () => {
  assert.equal(bucketFor(item({ id: "a", dueDate: "2026-08-10" }), NOW), "overdue");
  assert.equal(bucketFor(item({ id: "b", dueDate: "2026-08-12" }), NOW), "today");
  assert.equal(bucketFor(item({ id: "c", dueDate: "2026-08-15" }), NOW), "week");
  assert.equal(bucketFor(item({ id: "d", dueDate: "2026-09-30" }), NOW), "later");
  assert.equal(bucketFor(item({ id: "e" }), NOW), "undated");
});

test("time of day does not affect the bucket", () => {
  // An item due at 23:59 today is due today, not overdue, at 10:00.
  assert.equal(
    bucketFor(item({ id: "a", dueDate: "2026-08-12T23:59:00.000Z" }), NOW),
    "today",
  );
  // And one due at 00:01 today is still today at 10:00, not overdue.
  assert.equal(
    bucketFor(item({ id: "b", dueDate: "2026-08-12T00:01:00.000Z" }), NOW),
    "today",
  );
});

test("a completed item is never overdue", () => {
  // Otherwise a task finished a day late sits in the amber bucket forever.
  assert.equal(
    bucketFor(item({ id: "a", dueDate: "2026-08-01", status: "done" }), NOW),
    "later",
  );
  assert.equal(
    bucketFor(item({ id: "b", dueDate: "2026-08-01", status: "todo" }), NOW),
    "overdue",
  );
});

test("start date is used when there is no due date", () => {
  // Scheduled work with no deadline must not vanish into No date.
  assert.equal(
    bucketFor(item({ id: "a", startDate: "2026-08-12" }), NOW),
    "today",
  );
  // Due date wins when both are present.
  assert.equal(
    bucketFor(item({ id: "b", startDate: "2026-08-12", dueDate: "2026-09-30" }), NOW),
    "later",
  );
});

test("this week is a rolling seven days, not a calendar week", () => {
  // Boundary: day 6 is inside, day 7 is not.
  assert.equal(bucketFor(item({ id: "a", dueDate: "2026-08-18" }), NOW), "week");
  assert.equal(bucketFor(item({ id: "b", dueDate: "2026-08-19" }), NOW), "later");
});

test("Today survives even when empty; other empty buckets are dropped", () => {
  const groups = groupByTime([item({ id: "a", dueDate: "2026-09-30" })], NOW);
  const ids = groups.map((g) => g.id);
  assert.ok(ids.includes("today"), "empty Today is meaningful and must render");
  assert.ok(!ids.includes("overdue"), "empty Overdue is noise");
  assert.ok(!ids.includes("undated"), "empty No date is noise");
  assert.ok(ids.includes("later"));
});

test("buckets render in a fixed order with Overdue first", () => {
  const groups = groupByTime(
    [
      item({ id: "later", dueDate: "2026-09-30" }),
      item({ id: "undated" }),
      item({ id: "overdue", dueDate: "2026-08-01" }),
      item({ id: "week", dueDate: "2026-08-15" }),
      item({ id: "today", dueDate: "2026-08-12" }),
    ],
    NOW,
  );
  assert.deepEqual(
    groups.map((g) => g.id),
    ["overdue", "today", "week", "later", "undated"],
  );
});

test("items within a bucket sort by date, then priority", () => {
  const groups = groupByTime(
    [
      { ...item({ id: "late-low", dueDate: "2026-08-15" }), priority: "low" },
      { ...item({ id: "early", dueDate: "2026-08-13" }), priority: "low" },
      { ...item({ id: "late-high", dueDate: "2026-08-15" }), priority: "critical" },
    ],
    NOW,
  );
  const week = groups.find((g) => g.id === "week");
  assert.deepEqual(
    week?.items.map((i) => i.id),
    ["early", "late-high", "late-low"],
  );
});

test("an unparseable date is treated as undated, not as epoch", () => {
  // new Date("nonsense") is Invalid Date; unguarded it would compare as NaN
  // and land the item somewhere arbitrary.
  assert.equal(bucketFor(item({ id: "a", dueDate: "not-a-date" }), NOW), "undated");
});
