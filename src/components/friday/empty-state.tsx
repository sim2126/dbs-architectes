// Friday empty state — quiet, italic Cormorant Garamond title; optional
// icon, description, and a single action slot. Used wherever a list,
// table, or panel has nothing to show. The voice is reflective, not
// celebratory ("Nothing scheduled" beats "🎉 You're all caught up!").

import * as React from "react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center px-8 py-14",
        className,
      )}
    >
      {icon ? (
        <div className="mb-5 text-friday-fg-subtle" aria-hidden="true">
          {icon}
        </div>
      ) : null}
      <h3 className="font-display italic text-[22px] leading-tight text-friday-fg">
        {title}
      </h3>
      {description ? (
        <p className="mt-2 max-w-sm text-[13px] leading-relaxed text-friday-fg-muted">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}
