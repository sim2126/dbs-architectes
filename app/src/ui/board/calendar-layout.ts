/**
 * Where a dated item sits on a month grid.
 *
 * All of this is arithmetic on calendar days, and calendar arithmetic is
 * where quiet bugs live: a project that starts on a Sunday, a week that
 * straddles two months, an item longer than the row it is drawn in, a clock
 * change in the middle of March. So the maths is here, in one place, on UTC
 * midnights — never on local times, which are an hour shorter twice a year.
 *
 * Weeks start on Monday. This is a Swiss and Italian practice.
 */

const DAY = 86_400_000;

export type CalendarItem = {
  id: string;
  /** Inclusive first day. */
  start: Date;
  /** Inclusive last day. Equal to start for a single-day item. */
  end: Date;
};

export type CalendarSegment = {
  id: string;
  /** 0–6, Monday first. */
  startCol: number;
  /** How many columns it covers, at least 1. */
  span: number;
  /** Which stacked row within the week it draws on. */
  lane: number;
  /** The item began before this week, or runs past it. */
  continuesBefore: boolean;
  continuesAfter: boolean;
};

/** The UTC midnight of a date, which is how every day here is represented. */
export function toDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/** Encode the user's local calendar day using the grid's UTC-day arithmetic. */
export function localDay(date: Date): Date {
  return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
}

export function millisecondsUntilTomorrow(date: Date): number {
  const tomorrow = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
  return tomorrow.getTime() - date.getTime();
}

export function addDays(day: Date, count: number): Date {
  return new Date(day.getTime() + count * DAY);
}

export function addMonths(day: Date, count: number): Date {
  return new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth() + count, 1));
}

export function startOfMonth(day: Date): Date {
  return new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), 1));
}

export function sameDay(a: Date, b: Date): boolean {
  return a.getTime() === b.getTime();
}

export function isSameMonth(day: Date, month: Date): boolean {
  return day.getUTCFullYear() === month.getUTCFullYear() && day.getUTCMonth() === month.getUTCMonth();
}

/** Days from Monday: Monday 0 … Sunday 6. */
function mondayIndex(day: Date): number {
  return (day.getUTCDay() + 6) % 7;
}

/**
 * The weeks a month is drawn over: whole Monday-to-Sunday rows covering
 * every day of the month, with the days either side included so the grid is
 * never ragged.
 */
export function monthGrid(month: Date): Date[][] {
  const first = startOfMonth(month);
  const gridStart = addDays(first, -mondayIndex(first));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0));
  const gridEnd = addDays(last, 6 - mondayIndex(last));

  const weeks: Date[][] = [];
  for (let day = gridStart; day.getTime() <= gridEnd.getTime(); day = addDays(day, 7)) {
    weeks.push(Array.from({ length: 7 }, (_, i) => addDays(day, i)));
  }
  return weeks;
}

/**
 * Lay one week out.
 *
 * Longer items first, so a project running the whole week takes the top lane
 * and the short ones tuck underneath it — the arrangement a person would
 * draw by hand. Lanes are then filled greedily: an item takes the first lane
 * whose columns are free, so the block is as short as it can be.
 */
export function layoutWeek(
  week: readonly Date[],
  items: readonly CalendarItem[],
): CalendarSegment[] {
  if (week.length === 0) return [];
  const weekStart = week[0].getTime();
  const weekEnd = week[week.length - 1].getTime();

  const overlapping = items
    .filter((item) => item.start.getTime() <= weekEnd && item.end.getTime() >= weekStart)
    .map((item) => {
      const startCol = Math.max(0, Math.round((item.start.getTime() - weekStart) / DAY));
      const endCol = Math.min(week.length - 1, Math.round((item.end.getTime() - weekStart) / DAY));
      return {
        id: item.id,
        startCol,
        span: endCol - startCol + 1,
        continuesBefore: item.start.getTime() < weekStart,
        continuesAfter: item.end.getTime() > weekEnd,
      };
    })
    .sort((a, b) => b.span - a.span || a.startCol - b.startCol || a.id.localeCompare(b.id));

  // occupied[lane] is the set of columns already taken in that lane.
  const occupied: boolean[][] = [];
  return overlapping.map((segment) => {
    let lane = 0;
    for (;;) {
      if (!occupied[lane]) occupied[lane] = new Array(week.length).fill(false);
      const free = occupied[lane]
        .slice(segment.startCol, segment.startCol + segment.span)
        .every((taken) => !taken);
      if (free) {
        for (let i = segment.startCol; i < segment.startCol + segment.span; i++) {
          occupied[lane][i] = true;
        }
        return { ...segment, lane };
      }
      lane++;
    }
  });
}

/**
 * Read a day out of a cell. Accepts the `yyyy-mm-dd` a date input produces
 * and the full ISO timestamp a database returns, and refuses anything else
 * rather than producing an Invalid Date that poisons the arithmetic.
 */
export function parseDayValue(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : toDay(value);
  if (typeof value !== "string") return null;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const [, y, m, d] = match;
  const day = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  if (Number.isNaN(day.getTime())) return null;
  // Rejects 2026-02-31, which Date would silently roll into March.
  if (day.getUTCMonth() !== Number(m) - 1 || day.getUTCDate() !== Number(d)) return null;
  return day;
}

/** How a day is written in the product: 4 Sep 2026. */
export function formatDay(day: Date): string {
  return day.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

/** The `yyyy-mm-dd` a date input wants. */
export function toDayValue(day: Date): string {
  return day.toISOString().slice(0, 10);
}

/**
 * The span an item occupies, from whatever pair of dates it has. A project
 * with only a start is a point in time, not an open-ended bar across the
 * rest of the year; one with only an end is the same on its end date.
 */
export function itemSpan(start: Date | null, end: Date | null): { start: Date; end: Date } | null {
  if (!start && !end) return null;
  const from = start ?? end!;
  const to = end ?? start!;
  // A backwards range is someone's typo, not an instruction to draw nothing.
  return from.getTime() <= to.getTime() ? { start: from, end: to } : { start: to, end: from };
}
