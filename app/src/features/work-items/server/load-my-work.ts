/**
 * loadMyWork — everything assigned to one person, time-bucketed.
 *
 * Scoped to the caller by construction: the query filters on userId, so
 * there is no way for this to return another person's work. That is why it
 * needs no authorization branch of its own — "my work" is self-scoped.
 */

import { prisma } from "@/platform/db";
import { groupByTime, type WorkBucket } from "../domain/grouping";

export type MyWorkItem = {
  id: string;
  title: string;
  type: string;
  status: string;
  priority: string;
  startDate: string | null;
  dueDate: string | null;
  parentId: string | null;
  project: { id: string; code: string; title: string } | null;
  /** Direct children, for the subitem disclosure. */
  childCount: number;
};

export type MyWorkData = {
  buckets: WorkBucket<MyWorkItem>[];
  openCount: number;
  generatedAt: string;
};

export async function loadMyWork(
  userId: string,
  now: Date = new Date(),
): Promise<MyWorkData> {
  const rows = await prisma.workItem.findMany({
    where: {
      userId,
      status: { not: "done" },
      // Top-level only. Subitems belong under their parent, not loose in a
      // bucket — otherwise a three-subitem task appears four times.
      parentId: null,
    },
    select: {
      id: true,
      title: true,
      type: true,
      status: true,
      priority: true,
      startDate: true,
      dueDate: true,
      parentId: true,
      project: { select: { id: true, code: true, title: true } },
      _count: { select: { children: true } },
    },
  });

  const items: MyWorkItem[] = rows.map((r) => ({
    id: r.id,
    title: r.title,
    type: r.type,
    status: r.status,
    priority: r.priority,
    startDate: r.startDate ? r.startDate.toISOString() : null,
    dueDate: r.dueDate ? r.dueDate.toISOString() : null,
    parentId: r.parentId,
    project: r.project
      ? { id: r.project.id, code: r.project.code, title: r.project.title }
      : null,
    childCount: r._count.children,
  }));

  return {
    // groupByTime takes the raw shape; MyWorkItem satisfies BucketableItem
    // because dueDate/startDate are ISO strings and status is present.
    buckets: groupByTime(items, now),
    openCount: items.length,
    generatedAt: now.toISOString(),
  };
}
