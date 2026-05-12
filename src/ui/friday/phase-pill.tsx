// Friday phase pill — restrained design from Claude Design's set:
// 1px border in the phase color, 6px colored dot, transparent fill.
// Renders the DB phase name as-is (ETUDE/AP, MAE, CHANTIER…) so the
// component never has to know SIA-style p11/p21/etc. naming.

import * as React from "react";
import { getPhaseColor, type PhaseName } from "@/ui/tokens";
import { cn } from "@/ui/utils";

interface PhasePillProps {
  phase: PhaseName | string | null | undefined;
  size?: "sm" | "md";
  className?: string;
}

export function PhasePill({ phase, size = "md", className }: PhasePillProps) {
  if (!phase) return null;
  const color = getPhaseColor(phase);
  const sizeClasses =
    size === "sm"
      ? "px-2 py-0.5 text-[10px] gap-1"
      : "px-2.5 py-1 text-[11px] gap-1.5";

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border font-medium tracking-wide uppercase whitespace-nowrap",
        sizeClasses,
        className,
      )}
      style={{
        color,
        borderColor: color,
        background: "transparent",
      }}
    >
      <span
        className="inline-block rounded-full"
        style={{
          width: size === "sm" ? 5 : 6,
          height: size === "sm" ? 5 : 6,
          background: color,
        }}
      />
      {phase}
    </span>
  );
}
