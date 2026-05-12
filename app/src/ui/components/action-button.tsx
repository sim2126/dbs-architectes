"use client";

/**
 * ActionButton — a Button wrapper that handles the common async pattern.
 *
 * Pass an `onAction` returning a Promise. While that promise is pending:
 *   - the button is disabled (blocks double-clicks at the React layer)
 *   - shows a spinner inline before the children (immediate visual feedback)
 *   - rejection is swallowed for state purposes only — callers are
 *     responsible for surfacing errors (toast, inline message, etc.)
 *
 * Use this instead of writing the (setBusy → try → finally) dance by
 * hand. The double-click protection is also a defensive guard at the
 * function level: even if React re-renders slowly, a rapid second
 * click is ignored because `busy` is still true.
 *
 * For sync onClick handlers, keep using the plain <Button>.
 */

import * as React from "react";
import { Loader2 } from "lucide-react";
import { Button, type ButtonProps } from "@/ui/components/button";
import { cn } from "@/ui/utils";

interface ActionButtonProps extends Omit<ButtonProps, "onClick"> {
  /** Async action triggered by the click. */
  onAction: () => Promise<unknown>;
  /** Optional override for the label shown while pending. */
  loadingLabel?: React.ReactNode;
}

export const ActionButton = React.forwardRef<HTMLButtonElement, ActionButtonProps>(
  (
    { onAction, loadingLabel, children, disabled, className, ...rest },
    ref,
  ) => {
    const [busy, setBusy] = React.useState(false);

    const handleClick = React.useCallback(
      async (e: React.MouseEvent<HTMLButtonElement>) => {
        if (busy) {
          // Defensive: if the button briefly stayed enabled between state
          // updates, swallow the second click here.
          e.preventDefault();
          return;
        }
        setBusy(true);
        try {
          await onAction();
        } catch {
          // Caller surfaces errors. We just release the busy lock.
        } finally {
          setBusy(false);
        }
      },
      [busy, onAction],
    );

    return (
      <Button
        ref={ref}
        onClick={handleClick}
        disabled={disabled || busy}
        className={cn(className)}
        {...rest}
      >
        {busy ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            {loadingLabel ?? children}
          </>
        ) : (
          children
        )}
      </Button>
    );
  },
);
ActionButton.displayName = "ActionButton";
