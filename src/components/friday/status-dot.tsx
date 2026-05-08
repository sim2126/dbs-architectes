// Friday status dot — small colored dot indicator. Accepts both
// vocabularies (DB: todo/doing/stuck/completed; design: onTrack/atRisk/
// delayed/done) via getStatusColor.

import * as React from "react";
import { getStatusColor } from "@/lib/friday-tokens";
import { cn } from "@/lib/utils";

const DESIGN_LABELS: Record<string, string> = {
  // DB
  todo: "To-do",
  doing: "Working on it",
  stuck: "Stuck",
  completed: "Done",
  // Design
  onTrack: "On track",
  atRisk: "At risk",
  delayed: "Delayed",
  done: "Done",
};

interface StatusDotProps {
  status: string | null | undefined;
  size?: number;
  withLabel?: boolean;
  className?: string;
}

export function StatusDot({
  status,
  size = 7,
  withLabel = false,
  className,
}: StatusDotProps) {
  const color = getStatusColor(status);
  const label = status ? (DESIGN_LABELS[status] ?? DESIGN_LABELS[status.toLowerCase()] ?? status) : "";

  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <span
        className="inline-block rounded-full shrink-0"
        style={{ width: size, height: size, background: color }}
      />
      {withLabel && status ? (
        <span className="text-[12px] text-friday-fg-muted">{label}</span>
      ) : null}
    </span>
  );
}
