// Friday phase pill — restrained design from Claude Design's set:
// 1px border + 6px colored dot + transparent fill, with the phase
// label inside.
//
// Two render modes share the same component:
//
//   <PhasePill phase="p41" label="Phase 41 — DAP" />     // design API
//   <PhasePill phase="MAE" />                            // DB-name API (label inferred)
//
// The color lookup falls through both vocabularies via getPhaseColor.

import * as React from "react";
import { getPhaseColor, getPhaseLabel } from "@/lib/friday-tokens";
import { cn } from "@/lib/utils";

interface PhasePillProps {
  phase: string | null | undefined;
  /** Optional explicit display label. Overrides the inferred one. */
  label?: string;
  size?: "sm" | "md";
  /** Compact rendering — slightly tighter padding, used in dense lists. */
  compact?: boolean;
  className?: string;
}

export function PhasePill({
  phase,
  label,
  size = "md",
  compact,
  className,
}: PhasePillProps) {
  if (!phase) return null;
  const color = getPhaseColor(phase);
  const display = label ?? getPhaseLabel(phase);

  const tight = compact || size === "sm";
  const sizeClasses = tight
    ? "px-1.5 py-px text-[10.5px] gap-1.5"
    : "px-2 py-0.5 text-[11px] gap-1.5";

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-[3px] border border-friday-border-soft text-friday-fg whitespace-nowrap leading-snug",
        sizeClasses,
        className,
      )}
    >
      <span
        className="inline-block rounded-full shrink-0"
        style={{
          width: 6,
          height: 6,
          background: color,
        }}
      />
      <span>{display}</span>
    </span>
  );
}
