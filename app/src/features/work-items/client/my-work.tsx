"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Check, ChevronRight, Loader2, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { cn } from "@/ui/utils";
import { showToast } from "@/ui/components/toast";
import type { WorkBucketId } from "../domain/grouping";

type Item = {
  id: string;
  title: string;
  type: string;
  status: string;
  priority: string;
  startDate: string | null;
  dueDate: string | null;
  project: { id: string; code: string; title: string } | null;
  childCount: number;
};

type Bucket = { id: WorkBucketId; label: string; items: Item[] };

interface Props {
  buckets: Bucket[];
  openCount: number;
  userName: string;
}

/** Only Overdue is coloured. Everything else is structure, not signal —
 *  colouring all five buckets would make none of them mean anything. */
const BUCKET_TONE: Partial<Record<WorkBucketId, string>> = {
  overdue: "text-friday-error-fg",
};

function greeting(now = new Date()): string {
  const h = now.getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function dueLabel(item: Item): string | null {
  const iso = item.dueDate ?? item.startDate;
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
}

export function MyWork({ buckets, openCount, userName }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<WorkBucketId>>(new Set());
  const firstName = useMemo(() => userName.split(" ")[0] ?? userName, [userName]);

  const toggle = (id: WorkBucketId) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const complete = async (id: string) => {
    setBusy(id);
    try {
      const res = await fetch(`/api/tasks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "done" }),
      });
      if (!res.ok) {
        showToast("Could not update that item.", "danger");
        return;
      }
      router.refresh();
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="px-6 py-8 sm:px-8 max-w-4xl">
      <header className="mb-8">
        <h1 className="font-display italic text-foreground text-4xl leading-[1.05]">
          {greeting()}, {firstName}
        </h1>
        <p className="text-sm text-muted-foreground mt-2">
          {openCount === 0
            ? "Nothing open."
            : `${openCount} open ${openCount === 1 ? "item" : "items"}.`}
        </p>
      </header>

      <div className="space-y-7">
        {buckets.map((bucket) => {
          const isCollapsed = collapsed.has(bucket.id);
          return (
            <section key={bucket.id}>
              <button
                type="button"
                onClick={() => toggle(bucket.id)}
                aria-expanded={!isCollapsed}
                className="group flex items-center gap-1.5 mb-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
              >
                <ChevronRight
                  className={cn(
                    "h-3.5 w-3.5 text-muted-foreground transition-transform",
                    !isCollapsed && "rotate-90",
                  )}
                />
                <span
                  className={cn(
                    "text-xs font-medium uppercase tracking-wider",
                    BUCKET_TONE[bucket.id] ?? "text-muted-foreground",
                  )}
                >
                  {bucket.label}
                </span>
                <span className="text-xs text-friday-fg-subtle tabular-nums ml-1">
                  {bucket.items.length}
                </span>
              </button>

              {!isCollapsed && (
                <div className="border-t border-friday-border-soft">
                  {bucket.items.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-4">
                      Nothing scheduled.
                    </p>
                  ) : (
                    bucket.items.map((item) => (
                      <div
                        key={item.id}
                        className="group/row flex items-center gap-3 py-2.5 border-b border-friday-border-soft"
                      >
                        <button
                          type="button"
                          onClick={() => complete(item.id)}
                          disabled={busy === item.id}
                          aria-label={`Mark "${item.title}" done`}
                          className="shrink-0 h-4 w-4 rounded-full border border-friday-border flex items-center justify-center hover:border-friday-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors"
                        >
                          {busy === item.id ? (
                            <Loader2 className="h-2.5 w-2.5 animate-spin" />
                          ) : (
                            <Check className="h-2.5 w-2.5 opacity-0 group-hover/row:opacity-40 transition-opacity" />
                          )}
                        </button>

                        <span className="flex-1 min-w-0 text-sm text-foreground truncate">
                          {item.title}
                          {item.childCount > 0 && (
                            <span className="text-xs text-friday-fg-subtle ml-2 tabular-nums">
                              {item.childCount}
                            </span>
                          )}
                        </span>

                        {item.project && (
                          <Link
                            href={`/dashboard/projects/${item.project.id}`}
                            title={item.project.title}
                            className="shrink-0 text-xs text-muted-foreground hover:text-foreground font-mono transition-colors"
                          >
                            {item.project.code}
                          </Link>
                        )}

                        <span className="shrink-0 w-16 text-right text-xs text-muted-foreground tabular-nums">
                          {dueLabel(item) ?? ""}
                        </span>
                      </div>
                    ))
                  )}

                  <Link
                    href={`/dashboard/tasks?new=1&bucket=${bucket.id}`}
                    className="flex items-center gap-2 py-2.5 text-sm text-friday-fg-subtle hover:text-foreground transition-colors"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add item
                  </Link>
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
