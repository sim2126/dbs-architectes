"use client";

/**
 * The board's view controls: Person, Filter, Sort, Hide.
 *
 * Monday's board toolbar, in the same order and with the same meanings. They
 * change what is on screen and never touch the data, so all four are one
 * BoardView value (see ./view-state) handed back to the caller — which means
 * a board can hold that value wherever it likes, including nowhere.
 *
 * Presentational. The rules about what a filter includes and how a column
 * sorts live in view-state, tested.
 */

import { useCallback, useState } from "react";
import { ArrowUpDown, Check, EyeOff, Filter, Users, X } from "lucide-react";
import { cn } from "@/ui/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/ui/components/avatar";
import { displayValue, personInitials, type BoardColumn, type BoardPerson } from "./columns";
import {
  activeFilterCount,
  clearFilters,
  cycleSort,
  isHidden,
  selectedValues,
  toggleFilterValue,
  toggleHidden,
  togglePerson,
  type BoardView,
} from "./view-state";
import { useDismiss } from "./use-dismiss";

/** The value a filter uses for "this cell is empty". */
const NOT_SET = "";

export function BoardControls({
  columns,
  roster = [],
  view,
  onChange,
}: {
  /** Every column, including any currently hidden. */
  columns: readonly BoardColumn[];
  roster?: readonly BoardPerson[];
  view: BoardView;
  onChange: (view: BoardView) => void;
}) {
  const [open, setOpen] = useState<"person" | "filter" | "sort" | "hide" | null>(null);
  const close = useCallback(() => setOpen(null), []);
  const ref = useDismiss<HTMLDivElement>(close);

  const filterCount = activeFilterCount(view);
  const filterable = columns.filter(
    (column) => (column.kind === "status" || column.kind === "select") && column.options?.length,
  );
  const sortable = columns.filter((column) => column.kind !== "readonly");
  const sortedColumn = view.sort ? columns.find((c) => c.key === view.sort?.key) : undefined;

  return (
    <div ref={ref} className="flex items-center gap-0.5">
      {/* Person */}
      {roster.length > 0 && (
        <Control
          id="person"
          label="Person"
          icon={Users}
          badge={view.people.length > 0 ? String(view.people.length) : undefined}
          open={open === "person"}
          onToggle={setOpen}
        >
          <div className="max-h-72 w-56 overflow-y-auto py-1">
            {roster.map((person) => {
              const on = view.people.includes(person.id);
              return (
                <button
                  key={person.id}
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked={on}
                  onClick={() => onChange(togglePerson(view, person.id))}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors hover:bg-friday-surface-2"
                >
                  <Avatar className="h-5 w-5 text-[9px]">
                    {person.image && <AvatarImage src={person.image} alt="" />}
                    <AvatarFallback className="bg-friday-surface-3 text-[9px] text-friday-fg">
                      {personInitials(person)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="flex-1 truncate text-[12.5px] text-friday-fg">
                    {person.name ?? "Unnamed"}
                  </span>
                  {on && <Check className="h-3 w-3 shrink-0 text-friday-accent" />}
                </button>
              );
            })}
          </div>
        </Control>
      )}

      {/* Filter */}
      {filterable.length > 0 && (
        <Control
          id="filter"
          label="Filter"
          icon={Filter}
          badge={filterCount > 0 ? String(filterCount) : undefined}
          open={open === "filter"}
          onToggle={setOpen}
        >
          <div className="max-h-80 w-60 overflow-y-auto py-1">
            {filterable.map((column) => (
              <div key={column.key} className="mb-1 last:mb-0">
                <p className="px-3 py-1 font-mono text-[9px] uppercase tracking-[0.18em] text-friday-fg-subtle">
                  {column.label}
                </p>
                {[...(column.options ?? []), NOT_SET].map((option) => {
                  const on = selectedValues(view, column.key).includes(option);
                  return (
                    <button
                      key={option || "__not_set"}
                      type="button"
                      role="menuitemcheckbox"
                      aria-checked={on}
                      onClick={() => onChange(toggleFilterValue(view, column.key, option))}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors hover:bg-friday-surface-2"
                    >
                      {option !== NOT_SET && column.colorFor && (
                        <span
                          aria-hidden
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{ background: column.colorFor(option) }}
                        />
                      )}
                      <span className="flex-1 truncate text-[12.5px] text-friday-fg">
                        {option === NOT_SET ? "Not set" : displayValue(column, option)}
                      </span>
                      {on && <Check className="h-3 w-3 shrink-0 text-friday-accent" />}
                    </button>
                  );
                })}
              </div>
            ))}
            {filterCount > 0 && (
              <button
                type="button"
                role="menuitem"
                onClick={() => onChange(clearFilters(view))}
                className="mt-1 flex w-full items-center gap-1.5 border-t border-friday-border-soft px-3 py-2 text-left text-[12px] text-friday-fg-subtle transition-colors hover:text-friday-fg"
              >
                <X className="h-3 w-3" />
                Clear filters
              </button>
            )}
          </div>
        </Control>
      )}

      {/* Sort */}
      <Control
        id="sort"
        label="Sort"
        icon={ArrowUpDown}
        badge={sortedColumn ? sortedColumn.label : undefined}
        open={open === "sort"}
        onToggle={setOpen}
      >
        <div className="max-h-72 w-56 overflow-y-auto py-1">
          {sortable.map((column) => {
            const active = view.sort?.key === column.key;
            return (
              <button
                key={column.key}
                type="button"
                role="menuitem"
                onClick={() => onChange(cycleSort(view, column.key))}
                aria-label={`Sort by ${column.label}${
                  active ? (view.sort?.direction === "asc" ? ", ascending" : ", descending") : ""
                }`}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors hover:bg-friday-surface-2"
              >
                <span className="flex-1 truncate text-[12.5px] text-friday-fg">{column.label}</span>
                {active && (
                  <span className="shrink-0 text-[10.5px] text-friday-accent">
                    {view.sort?.direction === "asc" ? "A → Z" : "Z → A"}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </Control>

      {/* Hide */}
      <Control
        id="hide"
        label="Hide"
        icon={EyeOff}
        badge={view.hidden.length > 0 ? String(view.hidden.length) : undefined}
        open={open === "hide"}
        onToggle={setOpen}
      >
        <div className="max-h-72 w-56 overflow-y-auto py-1">
          {columns.map((column) => {
            const shown = !isHidden(view, column.key);
            return (
              <button
                key={column.key}
                type="button"
                role="menuitemcheckbox"
                aria-checked={shown}
                onClick={() => onChange(toggleHidden(view, column.key))}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors hover:bg-friday-surface-2"
              >
                <span className="flex-1 truncate text-[12.5px] text-friday-fg">{column.label}</span>
                {shown && <Check className="h-3 w-3 shrink-0 text-friday-accent" />}
              </button>
            );
          })}
        </div>
      </Control>
    </div>
  );
}

type ControlId = "person" | "filter" | "sort" | "hide";

function Control({
  id,
  label,
  icon: Icon,
  badge,
  open,
  onToggle,
  children,
}: {
  id: ControlId;
  label: string;
  icon: typeof Filter;
  badge?: string;
  open: boolean;
  onToggle: (id: ControlId | null) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => onToggle(open ? null : id)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn(
          "flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[12px] transition-colors",
          badge || open
            ? "bg-friday-surface-2 text-friday-fg"
            : "text-friday-fg-subtle hover:bg-friday-surface-2 hover:text-friday-fg",
        )}
      >
        <Icon className="h-3.5 w-3.5" />
        {label}
        {badge && (
          <span className="max-w-24 truncate rounded bg-friday-accent px-1 text-[9.5px] font-bold text-white">
            {badge}
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          aria-label={label}
          className="absolute left-0 top-full z-40 mt-1 overflow-hidden rounded-md border border-friday-border bg-friday-bg shadow-lg"
        >
          {children}
        </div>
      )}
    </div>
  );
}
