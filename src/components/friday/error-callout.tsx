// Friday error callout — friendly amber-on-cream pattern, intentionally
// not a red alarm banner. Used for soft failures: "Couldn't refresh",
// "AI is unavailable but the page still works", "Map key missing".
//
// Two API shapes share this component:
//
//   <ErrorCallout title="…" body="…" action="Try again" onAction={…} onDismiss={…} />
//   <ErrorCallout title="…">{children}</ErrorCallout>

import * as React from "react";
import { I } from "@/components/friday/icons";
import { cn } from "@/lib/utils";

interface ErrorCalloutProps {
  title?: string;
  /** Body content as text (Claude Design API). */
  body?: React.ReactNode;
  /** Body content as JSX children (alternate). */
  children?: React.ReactNode;
  /** Either an action node, or an action label string with `onAction`. */
  action?: React.ReactNode | string;
  onAction?: () => void;
  onDismiss?: () => void;
  variant?: "warn" | "success";
  className?: string;
}

export function ErrorCallout({
  title,
  body,
  children,
  action,
  onAction,
  onDismiss,
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

  const content = body ?? children;
  const actionIsText = typeof action === "string";

  return (
    <div
      role="status"
      className={cn(
        "rounded-md border px-3.5 py-3 text-[12.5px] leading-relaxed flex items-start gap-3",
        className,
      )}
      style={{
        background: palette.bg,
        borderColor: palette.border,
        color: palette.fg,
      }}
    >
      <I.AlertSmall size={16} className="mt-0.5 shrink-0" />
      <div className="flex-1 flex flex-col gap-1">
        {title ? <div className="font-medium">{title}</div> : null}
        {content ? (
          <div className="opacity-90 leading-relaxed">{content}</div>
        ) : null}
        {action ? (
          <div className="mt-1.5">
            {actionIsText ? (
              <button
                type="button"
                onClick={onAction}
                className="bg-transparent border-0 p-0 cursor-pointer font-medium underline underline-offset-[3px]"
                style={{ color: palette.fg }}
              >
                {action} →
              </button>
            ) : (
              action
            )}
          </div>
        ) : null}
      </div>
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="bg-transparent border-0 p-0.5 cursor-pointer opacity-60 leading-none"
          style={{ color: palette.fg }}
        >
          <I.X size={13} />
        </button>
      ) : null}
    </div>
  );
}
