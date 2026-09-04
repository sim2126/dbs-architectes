import { prisma } from "@/platform/db";
import { toNotificationDTO, type NotificationDTO } from "../domain/types";

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
  hasMore: boolean;
  nextCursor: string | null;
}

/** Newest first, for the calling user only. */
export async function listNotifications(
  userId: string,
  options: { limit?: number; cursor?: string | null } = {},
): Promise<NotificationPage> {
  const limit = options.limit ?? 20;
  const [rows, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: { userId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
      ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
      select: SELECT,
    }),
    prisma.notification.count({ where: { userId, readAt: null } }),
  ]);

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  return {
    notifications: page.map((row) =>
      toNotificationDTO(row, { projectCode: row.project?.code ?? null, actor: row.actor }),
    ),
    unreadCount,
    hasMore,
    nextCursor: hasMore ? page[page.length - 1].id : null,
  };
}

/**
 * Mark the given rows, or every unread row, as read. Scoped to the caller:
 * ids belonging to someone else are simply not matched.
 */
export async function markNotificationsRead(
  userId: string,
  target: { ids: string[] } | { all: true },
): Promise<{ updated: number; unreadCount: number }> {
  const where =
    "all" in target
      ? { userId, readAt: null }
      : { userId, readAt: null, id: { in: target.ids } };
  const { count } = await prisma.notification.updateMany({
    where,
    data: { readAt: new Date() },
  });
  const unreadCount = await prisma.notification.count({ where: { userId, readAt: null } });
  return { updated: count, unreadCount };
}
