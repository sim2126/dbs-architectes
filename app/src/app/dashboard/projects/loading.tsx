import { Skeleton } from "@/ui/components/skeleton";

/**
 * Projects is a card grid, not a list, so the shared dashboard skeleton
 * would shift the layout when the real content arrives. A skeleton that
 * settles into a different shape is worse than none — it draws the eye to
 * the jump.
 */
export default function ProjectsLoading() {
  return (
    <div className="px-6 py-8 sm:px-8">
      <div className="flex items-center justify-between mb-6">
        <Skeleton className="h-9 w-48" />
        <div className="flex items-center gap-2">
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-9 w-24" />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 9 }).map((_, i) => (
          <div
            key={i}
            className="rounded-md border border-friday-border-soft overflow-hidden"
          >
            <Skeleton className="h-36 w-full rounded-none" />
            <div className="p-4">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-4 w-3/4 mt-2.5" />
              <div className="flex items-center gap-2 mt-3">
                <Skeleton className="h-5 w-16 rounded-full" />
                <Skeleton className="h-5 w-12 rounded-full" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
