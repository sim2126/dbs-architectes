// Friday status dot — Monday-style colored dot for work-status indication
// (todo / doing / stuck / completed). Pairs naturally with a label next to it.

import * as React from "react";
import { getStatusColor, type WorkStatus } from "@/ui/tokens";
import { cn } from "@/ui/utils";

interface StatusDotProps {
  status: WorkStatus | string | null | undefined;
  size?: number;
  withLabel?: boolean;
  className?: string;
}

const LABELS: Record<string, string> = {
  todo: "To-do",
  doing: "Working on it",
  stuck: "Stuck",
  completed: "Done",
};

export function StatusDot({
  status,
  size = 8,
  withLabel = false,
  className,
}: StatusDotProps) {
  const color = getStatusColor(status);
  const label = status ? (LABELS[status.toLowerCase()] ?? status) : "";

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
