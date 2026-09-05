import { prisma } from "@/platform/db";
import type { Subject } from "@/platform/authz";
import { toNotificationDTO, type NotificationDTO, type NotificationCategory } from "../domain/types";
import { filterReadableNotifications } from "./filter-readable-notifications";
import { paginateNotifications, parseNotificationCursor } from "../domain/pagination";

const SELECT = {
  id: true,
  type: true,
  title: true,
  body: true,
  href: true,
  readAt: true,
  createdAt: true,
  project: { select: { code: true } },
  actor: { select: { name: true, initials: true } },
} as const;

export interface NotificationPage {
  notifications: NotificationDTO[];
  unreadCount: number;
  unreadByCategory: Record<NotificationCategory, number>;
  hasMore: boolean;
  nextCursor: string | null;
}

/** Newest first, for the calling user only. */
export async function listNotifications(
  subject: Subject,
  options: { limit?: number; cursor?: string | null; category?: NotificationCategory } = {},
): Promise<NotificationPage> {
  const limit = options.limit ?? 20;
  // Access may have changed since delivery. Scan source metadata first so
  // revoked excerpts never reach the response, pagination or unread counts.
  const metadata = await prisma.notification.findMany({
    where: { userId: subject.userId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { id: true, projectId: true, href: true, type: true, readAt: true, createdAt: true },
  });
  const readable = await filterReadableNotifications(subject, metadata);
  const { page: selected, hasMore, unreadCount, unreadByCategory, nextCursor } = paginateNotifications(readable, {
    limit, category: options.category, cursor: options.cursor ? parseNotificationCursor(options.cursor) : null,
  });
  const ids = selected.map((row) => row.id);
  const page = await prisma.notification.findMany({
    where: { userId: subject.userId, id: { in: ids } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: SELECT,
  });
  return {
    notifications: page.map((row) =>
      toNotificationDTO(row, { projectCode: row.project?.code ?? null, actor: row.actor }),
    ),
    unreadCount,
    unreadByCategory,
    hasMore,
    nextCursor,
  };
}

/**
 * Mark the given rows, or every unread row, as read. Scoped to the caller:
 * ids belonging to someone else are simply not matched.
 */
export async function markNotificationsRead(
  subject: Subject,
  target: { ids: string[] } | { all: true },
): Promise<{ updated: number; unreadCount: number }> {
  const userId = subject.userId;
  const where = "all" in target ? { userId, readAt: null } : { userId, readAt: null, id: { in: target.ids } };
  const { count } = await prisma.notification.updateMany({
    where,
    data: { readAt: new Date() },
  });
  const { unreadCount } = await listNotifications(subject, { limit: 1 });
  return { updated: count, unreadCount };
}
