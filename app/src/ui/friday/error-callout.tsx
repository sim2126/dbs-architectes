// Friday error callout — friendly amber-on-cream pattern from Claude
// Design, intentionally NOT a red alarm banner. Used for soft failures:
// "Couldn't refresh", "AI is unavailable, the rest of the page still
// works", "Map key missing". Errors should feel like a polite notice,
// not a crash.

import * as React from "react";
import { cn } from "@/ui/utils";

interface ErrorCalloutProps {
  title?: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
  variant?: "warn" | "success";
  className?: string;
}

export function ErrorCallout({
  title,
  children,
  action,
  variant = "warn",
  className,
}: ErrorCalloutProps) {
  const palette =
    variant === "success"
      ? {
          bg: "var(--friday-error-bg)",
          border: "var(--friday-error-border)",
          fg: "var(--friday-success-fg)",
        }
      : {
          bg: "var(--friday-error-bg)",
          border: "var(--friday-error-border)",
          fg: "var(--friday-error-fg)",
        };

  return (
    <div
      role="status"
      className={cn(
        "rounded-md border px-4 py-3 text-[13px] leading-relaxed",
        className,
      )}
      style={{
        background: palette.bg,
        borderColor: palette.border,
        color: palette.fg,
      }}
    >
      {title ? <div className="font-medium mb-0.5">{title}</div> : null}
      {children ? <div>{children}</div> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
