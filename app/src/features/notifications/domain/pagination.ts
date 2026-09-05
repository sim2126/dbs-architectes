import { categoryOf, isNotificationType, type NotificationCategory } from "./types";

type NotificationMetadata = { id: string; type: string; readAt: Date | null; createdAt: Date };
type NotificationCursor = { id: string; createdAt: Date };

export function parseNotificationCursor(value: string): NotificationCursor | null {
  const separator = value.indexOf(":");
  if (separator < 1) return null;
  const stamp = value.slice(0, separator);
  const id = value.slice(separator + 1);
  if (!/^\d+$/.test(stamp) || !/^[a-zA-Z0-9_-]{1,100}$/.test(id)) return null;
  const createdAt = new Date(Number(stamp));
  return Number.isFinite(createdAt.getTime()) ? { id, createdAt } : null;
}

/** Counts cover all authorised rows, independently of the displayed page/tab. */
export function paginateNotifications<T extends NotificationMetadata>(
  rows: readonly T[],
  options: { limit: number; cursor?: NotificationCursor | null; category?: NotificationCategory },
) {
  const unreadByCategory = { mentions: 0, updates: 0 };
  const category = (row: T) => isNotificationType(row.type) ? categoryOf(row.type) : "updates";
  for (const row of rows) if (!row.readAt) unreadByCategory[category(row)]++;
  const matching = rows.filter((row) => {
    const cursor = options.cursor;
    const afterCursor = !cursor || row.createdAt < cursor.createdAt ||
      (row.createdAt.getTime() === cursor.createdAt.getTime() && row.id < cursor.id);
    return afterCursor && (!options.category || category(row) === options.category);
  });
  const page = matching.slice(0, options.limit);
  const hasMore = matching.length > options.limit;
  const last = page.at(-1);
  return {
    page, hasMore,
    nextCursor: hasMore && last ? `${last.createdAt.getTime()}:${last.id}` : null,
    unreadCount: unreadByCategory.mentions + unreadByCategory.updates,
    unreadByCategory,
  };
}
