import { Skeleton } from "@/ui/components/skeleton";

/**
 * Chat is a two-pane layout that fills the viewport. `h-full min-h-0`, never
 * `h-screen` — the dashboard already places children in a flex-1 main, and
 * h-screen here pushes the composer below the fold. That has broken twice.
 */
export default function ChatLoading() {
  return (
    <div className="flex h-full min-h-0">
      <div className="w-64 shrink-0 border-r border-friday-border-soft p-3 space-y-5">
        {Array.from({ length: 2 }).map((_, section) => (
          <div key={section}>
            <Skeleton className="h-3 w-20 mb-2.5" />
            <div className="space-y-1.5">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-7 w-full" />
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="flex-1 min-w-0 flex flex-col">
        <div className="h-14 border-b border-friday-border-soft flex items-center px-5">
          <Skeleton className="h-4 w-40" />
        </div>

        <div className="flex-1 min-h-0 p-5 space-y-5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex gap-3">
              <Skeleton className="h-8 w-8 rounded-full shrink-0" />
              <div className="flex-1 min-w-0">
                <Skeleton className="h-3 w-28" />
                <Skeleton
                  className="h-3.5 mt-2"
                  style={{ width: `${45 + ((i * 17) % 45)}%` }}
                />
              </div>
            </div>
          ))}
        </div>

        <div className="p-4 border-t border-friday-border-soft">
          <Skeleton className="h-11 w-full" />
        </div>
      </div>
    </div>
  );
}
