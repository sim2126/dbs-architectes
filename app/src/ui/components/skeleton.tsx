import { cn } from "@/ui/utils";

/**
 * Loading placeholder.
 *
 * Skeletons over spinners for content: a skeleton preserves layout and
 * communicates *what* is loading, where a spinner only says *something*
 * is. Layout that does not shift when data arrives is the single biggest
 * perceived-quality difference in a data-heavy product.
 * See docs/frontend/05-motion-and-interaction.md.
 *
 * The pulse is suppressed under prefers-reduced-motion — the shape stays,
 * which is the part carrying the information.
 */
export function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden
      className={cn(
        "rounded-md bg-friday-surface-2 motion-safe:animate-pulse",
        className,
      )}
      {...props}
    />
  );
}

/** A skeleton row shaped like a list item — icon, title, trailing meta. */
export function SkeletonRow({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-3 py-2.5", className)}>
      <Skeleton className="h-4 w-4 rounded-full shrink-0" />
      <Skeleton className="h-3.5 flex-1 max-w-[42%]" />
      <Skeleton className="h-3 w-14 shrink-0" />
      <Skeleton className="h-3 w-10 shrink-0" />
    </div>
  );
}
