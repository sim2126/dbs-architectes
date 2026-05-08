// Friday empty state — quiet, italic Cormorant Garamond title with an
// optional large display "glyph" (used as a soft visual anchor in the
// Claude Design screens), description, and action.
//
//   <EmptyState glyph="·" title="Quiet day." body="Nothing to surface." />
//   <EmptyState icon={<I.Folder size={20} />} title="No projects" />

import * as React from "react";
import { Button } from "@/components/friday/button";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  /** Large italic display character (Claude Design pattern). */
  glyph?: string;
  /** Custom icon node (alternative to glyph). */
  icon?: React.ReactNode;
  title: string;
  /** Accepts both `description` and `body`; either renders the same. */
  description?: React.ReactNode;
  body?: React.ReactNode;
  /** Inline action node (legacy). */
  action?: React.ReactNode;
  /** Convenience: text + handler render a primary button via the Button primitive. */
  cta?: string;
  onCta?: () => void;
  className?: string;
}

export function EmptyState({
  glyph,
  icon,
  title,
  description,
  body,
  action,
  cta,
  onCta,
  className,
}: EmptyStateProps) {
  const subtext = description ?? body;
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center px-6 py-8",
        className,
      )}
    >
      {glyph ? (
        <div
          className="font-display italic text-friday-fg-subtle leading-none mb-1"
          style={{ fontSize: 44 }}
          aria-hidden="true"
        >
          {glyph}
        </div>
      ) : icon ? (
        <div className="mb-3 text-friday-fg-subtle" aria-hidden="true">
          {icon}
        </div>
      ) : null}
      <h3 className="font-display italic text-[18px] leading-tight text-friday-fg font-medium m-0">
        {title}
      </h3>
      {subtext ? (
        <p className="mt-2 max-w-[280px] text-[12.5px] leading-relaxed text-friday-fg-muted">
          {subtext}
        </p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
      {!action && cta ? (
        <div className="mt-3">
          <Button kind="secondary" onClick={onCta}>
            {cta}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
