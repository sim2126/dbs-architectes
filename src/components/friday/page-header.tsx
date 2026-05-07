// Friday page header — the canonical anatomy used by every screen in
// the redesign: optional kicker (small uppercase tracked), Cormorant
// italic title, optional muted subtitle, optional icon glyph before
// the title, and an actions slot pinned to the right.
//
// Renders inside the page content area, NOT inside the topbar.

import * as React from "react";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
  kicker?: string;
  title: string;
  subtitle?: React.ReactNode;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
  size?: "md" | "lg";
  className?: string;
}

export function FridayPageHeader({
  kicker,
  title,
  subtitle,
  icon,
  actions,
  size = "md",
  className,
}: PageHeaderProps) {
  const titleSize = size === "lg" ? "text-[32px]" : "text-[28px]";

  return (
    <header
      className={cn(
        "flex items-start justify-between gap-6 mb-6",
        className,
      )}
    >
      <div className="flex items-start gap-3 min-w-0">
        {icon ? (
          <span
            className="shrink-0 text-friday-fg-muted mt-1"
            aria-hidden="true"
          >
            {icon}
          </span>
        ) : null}
        <div className="min-w-0">
          {kicker ? (
            <div className="text-[10px] uppercase tracking-[0.22em] text-friday-fg-muted font-semibold mb-1">
              {kicker}
            </div>
          ) : null}
          <h1
            className={cn(
              "font-display italic font-medium leading-tight tracking-tight text-friday-fg m-0",
              titleSize,
            )}
          >
            {title}
          </h1>
          {subtitle ? (
            <div className="text-[12px] text-friday-fg-muted mt-1.5 leading-relaxed">
              {subtitle}
            </div>
          ) : null}
        </div>
      </div>
      {actions ? (
        <div className="shrink-0 flex items-center gap-2">{actions}</div>
      ) : null}
    </header>
  );
}
