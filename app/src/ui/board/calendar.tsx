"use client";

/**
 * The board as a month — Monday's Calendar.
 *
 * Rows that carry dates are drawn as bars across the days they cover, so a
 * project running from March to June reads as one continuous thing rather
 * than ninety separate marks. The colour is the grouping column's, so the
 * calendar answers "what is running, and in which phase" at a glance.
 *
 * Rows with no dates are not silently dropped: the header says how many
 * there are, because on a board of hundreds the projects nobody has dated
 * are exactly the ones worth noticing.
 *
 * The arithmetic — grids, spans, lanes, clock changes — is in
 * ./calendar-layout, where it is tested.
 */

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/ui/utils";
import { displayValue, type BoardColumn, type BoardRow } from "./columns";
import {
  addMonths,
  formatDay,
  isSameMonth,
  itemSpan,
  layoutWeek,
  monthGrid,
  parseDayValue,
  sameDay,
  startOfMonth,
  localDay,
  millisecondsUntilTomorrow,
  type CalendarItem,
} from "./calendar-layout";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const LANE_H = 20;

export type CalendarProps = {
  rows: readonly BoardRow[];
  /** The column giving each bar its colour, usually the grouping column. */
  colourBy: BoardColumn;
  /** Cell key holding the first day. */
  startKey: string;
  /** Cell key holding the last day. Omit for single-day items. */
  endKey?: string;
  onOpenRow?: (rowId: string) => void;
  itemNoun?: string;
};

export function Calendar({
  rows,
  colourBy,
  startKey,
  endKey,
  onOpenRow,
  itemNoun = "item",
}: CalendarProps) {
  const [month, setMonth] = useState(() => startOfMonth(localDay(new Date())));
  const weeks = useMemo(() => monthGrid(month), [month]);
  const [today, setToday] = useState(() => localDay(new Date()));
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const refresh = () => {
      clearTimeout(timer);
      const now = new Date();
      setToday(localDay(now));
      timer = setTimeout(refresh, millisecondsUntilTomorrow(now) + 1);
    };
    timer = setTimeout(refresh, millisecondsUntilTomorrow(new Date()) + 1);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);

  const { items, byId, undated } = useMemo(() => {
    const placed: CalendarItem[] = [];
    const lookup = new Map<string, BoardRow>();
    let missing = 0;
    for (const row of rows) {
      const span = itemSpan(
        parseDayValue(row.cells[startKey]),
        endKey ? parseDayValue(row.cells[endKey]) : null,
      );
      if (!span) {
        missing++;
        continue;
      }
      placed.push({ id: row.id, start: span.start, end: span.end });
      lookup.set(row.id, row);
    }
    return { items: placed, byId: lookup, undated: missing };
  }, [rows, startKey, endKey]);

  const monthLabel = month.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex shrink-0 items-center gap-2 px-4 py-2.5">
        <button
          type="button"
          onClick={() => setMonth((m) => addMonths(m, -1))}
          aria-label="Previous month"
          className="rounded-md p-1.5 text-friday-fg-subtle transition-colors hover:bg-friday-surface-2 hover:text-friday-fg"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <h2 className="min-w-44 text-center font-display text-[15px] italic text-friday-fg">
          {monthLabel}
        </h2>
        <button
          type="button"
          onClick={() => setMonth((m) => addMonths(m, 1))}
          aria-label="Next month"
          className="rounded-md p-1.5 text-friday-fg-subtle transition-colors hover:bg-friday-surface-2 hover:text-friday-fg"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => setMonth(startOfMonth(localDay(new Date())))}
          className="rounded-md px-2.5 py-1 text-[12px] text-friday-fg-subtle transition-colors hover:bg-friday-surface-2 hover:text-friday-fg"
        >
          Today
        </button>

        <span className="flex-1" />

        {undated > 0 && (
          <span className="text-[11px] text-friday-fg-subtle">
            {undated} {undated === 1 ? itemNoun : `${itemNoun}s`} with no dates
          </span>
        )}
      </div>

      <div className="grid shrink-0 grid-cols-7 border-b border-friday-border-soft px-4">
        {WEEKDAYS.map((label) => (
          <span
            key={label}
            className="px-1 pb-1.5 font-mono text-[9.5px] uppercase tracking-[0.18em] text-friday-fg-subtle"
          >
            {label}
          </span>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {weeks.map((week) => {
          const segments = layoutWeek(week, items);
          const lanes = segments.reduce((max, s) => Math.max(max, s.lane + 1), 0);
          return (
            <div key={week[0].toISOString()} className="border-b border-friday-border-soft last:border-0">
              <div className="grid grid-cols-7">
                {week.map((day) => (
                  <span
                    key={day.toISOString()}
                    className={cn(
                      "px-1 pt-1.5 text-[11px]",
                      isSameMonth(day, month) ? "text-friday-fg" : "text-friday-fg-subtle",
                    )}
                  >
                    <span
                      className={cn(
                        "inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1",
                        sameDay(day, today) && "bg-friday-accent font-semibold text-white",
                      )}
                    >
                      {day.getUTCDate()}
                    </span>
                  </span>
                ))}
              </div>

              <div
                className="relative"
                style={{ height: Math.max(lanes, 1) * LANE_H + 8 }}
              >
                {segments.map((segment) => {
                  const row = byId.get(segment.id);
                  if (!row) return null;
                  const value = String(row.cells[colourBy.key] ?? "");
                  const background = colourBy.colorFor?.(value) ?? "var(--friday-surface-3)";
                  const colour = colourBy.onColorFor?.(value) ?? "var(--friday-bg)";
                  const span = itemSpan(
                    parseDayValue(row.cells[startKey]),
                    endKey ? parseDayValue(row.cells[endKey]) : null,
                  );
                  const when = span
                    ? span.start.getTime() === span.end.getTime()
                      ? formatDay(span.start)
                      : `${formatDay(span.start)} to ${formatDay(span.end)}`
                    : "";
                  return (
                    <button
                      key={segment.id}
                      type="button"
                      onClick={() => onOpenRow?.(segment.id)}
                      title={`${row.title} · ${when}`}
                      aria-label={`${row.title}, ${when}${value ? `, ${displayValue(colourBy, value)}` : ""}`}
                      className={cn(
                        "absolute flex h-4.5 items-center overflow-hidden px-1.5 text-[10.5px] font-medium",
                        segment.continuesBefore ? "rounded-l-none" : "rounded-l",
                        segment.continuesAfter ? "rounded-r-none" : "rounded-r",
                      )}
                      style={{
                        left: `calc(${(segment.startCol / 7) * 100}% + 2px)`,
                        width: `calc(${(segment.span / 7) * 100}% - 4px)`,
                        top: segment.lane * LANE_H + 2,
                        background,
                        color: colour,
                      }}
                    >
                      <span className="truncate">{row.title}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
