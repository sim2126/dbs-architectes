import { cn } from "@/ui/utils";

/**
 * Marks someone as outside the practice.
 *
 * This is a safety control, not decoration. People speak differently when
 * they know an outsider is in the room, and the standard failure of shared
 * channels is someone posting an internal remark — a fee dispute, a
 * contractor problem — into a conversation they have forgotten a client is
 * part of. The badge has to be present wherever a guest's name appears.
 *
 * Uses the amber feedback tokens rather than the phase or status palettes:
 * those carry project semantics, and a guest is not a project state.
 */
export function GuestBadge({
  className,
  compact = false,
}: {
  className?: string;
  /** Dot only, for dense rows where a word would not fit. */
  compact?: boolean;
}) {
  if (compact) {
    return (
      <span
        role="img"
        aria-label="Guest — outside the practice"
        title="Guest — outside the practice"
        className={cn(
          "inline-block h-1.5 w-1.5 rounded-full bg-friday-error-fg shrink-0",
          className,
        )}
      />
    );
  }

  return (
    <span
      title="Guest — outside the practice"
      className={cn(
        "inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium",
        "border border-friday-error-border bg-friday-error-bg text-friday-error-fg",
        "shrink-0",
        className,
      )}
    >
      Guest
    </span>
  );
}
