/**
 * Time-bucketing for My Work.
 *
 * Grouping is the interface here — the page is already grouped by the thing
 * that matters rather than offering a filter the user has to apply. The
 * buckets answer "what do I do next", which is why they are time-based and
 * not status-based. Status grouping answers a manager's question, and
 * managers have Team Workload for that.
 *
 * Pure: pass items and a `now`, get deterministic buckets. No DB, no clock
 * read — the clock is injected so tests don't depend on when they run.
 */

export type WorkBucketId = "overdue" | "today" | "week" | "later" | "undated";

export type BucketableItem = {
  id: string;
  dueDate: Date | string | null;
  startDate?: Date | string | null;
  status: string;
  /** Used only for tie-breaking within a bucket. Absent is treated as medium. */
  priority?: string;
};

export type WorkBucket<T> = {
  id: WorkBucketId;
  label: string;
  items: T[];
};

/** Display order. Overdue first, always — it is the only bucket that
 *  represents a broken promise. `undated` last but never hidden: the
 *  honest bucket most tools quietly drop. */
const BUCKET_ORDER: { id: WorkBucketId; label: string }[] = [
  { id: "overdue", label: "Overdue" },
  { id: "today", label: "Today" },
  { id: "week", label: "This week" },
  { id: "later", label: "Later" },
  { id: "undated", label: "No date" },
];

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * UTC day boundary, matching loadTeamWorkload's `startOfDayUtc`.
 *
 * Deliberately not local time. DBS works across Sion, Milano and Srinagar;
 * with local boundaries the same due date lands in a different bucket
 * depending on who is looking, and a task due "today" in Switzerland reads
 * as tomorrow in Kashmir. UTC is arbitrary but consistent, and it matches
 * the convention already established elsewhere in the codebase.
 */
function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  return x;
}

/**
 * The effective date an item is judged on. An item with a start date but no
 * due date still belongs somewhere — treating it as undated would hide
 * scheduled work from the person doing it.
 */
export function effectiveDate(item: BucketableItem): Date | null {
  return toDate(item.dueDate) ?? toDate(item.startDate ?? null);
}

export function bucketFor(item: BucketableItem, now: Date): WorkBucketId {
  const date = effectiveDate(item);
  if (!date) return "undated";

  const today = startOfDay(now);
  const itemDay = startOfDay(date);

  // A completed item is never overdue — it was finished, however late.
  // Without this, a done task sits in the amber bucket permanently.
  if (itemDay < today) return item.status === "done" ? "later" : "overdue";
  if (itemDay.getTime() === today.getTime()) return "today";

  // "This week" runs to the end of the 7th day from today, not to Sunday.
  // A rolling window is more useful than a calendar week — on a Friday,
  // a calendar week would show almost nothing.
  const weekEnd = new Date(today);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);
  if (itemDay < weekEnd) return "week";

  return "later";
}

/**
 * Groups items into display buckets.
 *
 * Empty buckets are dropped except `today` — an empty Today is meaningful
 * ("nothing scheduled") whereas an empty Later is just noise.
 */
export function groupByTime<T extends BucketableItem>(
  items: readonly T[],
  now: Date,
): WorkBucket<T>[] {
  const byBucket = new Map<WorkBucketId, T[]>();
  for (const item of items) {
    const id = bucketFor(item, now);
    byBucket.set(id, [...(byBucket.get(id) ?? []), item]);
  }

  return BUCKET_ORDER.flatMap(({ id, label }) => {
    const bucketItems = (byBucket.get(id) ?? []).sort(compareWithinBucket);
    if (bucketItems.length === 0 && id !== "today") return [];
    return [{ id, label, items: bucketItems }];
  });
}

const PRIORITY_RANK: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

/** Earliest date first; ties broken by priority, then title. */
function compareWithinBucket(a: BucketableItem, b: BucketableItem): number {
  const da = effectiveDate(a);
  const db = effectiveDate(b);
  if (da && db && da.getTime() !== db.getTime()) return da.getTime() - db.getTime();
  if (da && !db) return -1;
  if (!da && db) return 1;

  const pa = PRIORITY_RANK[a.priority ?? "medium"] ?? 2;
  const pb = PRIORITY_RANK[b.priority ?? "medium"] ?? 2;
  return pa - pb;
}
