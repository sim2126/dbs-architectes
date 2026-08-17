import { Skeleton } from "@/ui/components/skeleton";

/** Statistics leads with a KPI row and chart blocks — a very different
 *  shape from the list skeleton, and the tallest content on the page. */
export default function StatisticsLoading() {
  return (
    <div className="px-6 py-8 sm:px-8 max-w-6xl">
      <Skeleton className="h-9 w-56 mb-8" />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i}>
            <Skeleton className="h-10 w-20" />
            <Skeleton className="h-3 w-28 mt-2.5" />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {Array.from({ length: 2 }).map((_, i) => (
          <div
            key={i}
            className="rounded-md border border-friday-border-soft p-5"
          >
            <Skeleton className="h-4 w-36 mb-5" />
            <Skeleton className="h-56 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
