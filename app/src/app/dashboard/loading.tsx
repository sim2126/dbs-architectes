import { Skeleton, SkeletonRow } from "@/ui/components/skeleton";

/**
 * Route-segment loading UI for every dashboard page.
 *
 * Without this file, App Router renders nothing between a nav click and the
 * server's response — the previous page simply sits there, which reads as a
 * frozen or broken interface. This is the single largest perceived-
 * performance fix available on a fully dynamic route tree.
 *
 * Deliberately generic: it matches the shape shared by nearly every
 * dashboard surface — a title, a subtitle, then rows. A per-route skeleton
 * is better where a page differs sharply; those override this by adding
 * their own loading.tsx alongside their page.tsx.
 */
export default function DashboardLoading() {
  return (
    <div className="px-6 py-8 sm:px-8 max-w-5xl">
      <div className="mb-8">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-4 w-40 mt-3" />
      </div>

      <div className="space-y-7">
        {[0, 1].map((section) => (
          <section key={section}>
            <Skeleton className="h-3 w-24 mb-3" />
            <div className="border-t border-friday-border-soft">
              {Array.from({ length: section === 0 ? 4 : 3 }).map((_, i) => (
                <SkeletonRow
                  key={i}
                  className="border-b border-friday-border-soft"
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
