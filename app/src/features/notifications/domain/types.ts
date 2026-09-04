/**
 * Notification vocabulary. The database stores `type` as a string; this file
 * owns which strings exist and which tab of the bell each one lands in.
 */

export const NOTIFICATION_TYPES = [
  "status_posted",
  "mentioned",
  "thread_reply",
  "direct_message",
  "assigned",
  "role_changed",
  "due_soon",
  "overdue",
  "health_dropped",
  "digest",
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export function isNotificationType(value: unknown): value is NotificationType {
  return typeof value === "string" && (NOTIFICATION_TYPES as readonly string[]).includes(value);
}

/** The two tabs of the bell. Also the key of NotificationPreference.category. */
export type NotificationCategory = "mentions" | "updates";

export function categoryOf(type: NotificationType): NotificationCategory {
  switch (type) {
    case "mentioned":
    case "thread_reply":
    case "direct_message":
      return "mentions";
    default:
      return "updates";
  }
}

/** Wire shape returned by GET /api/notifications and pushed over Pusher. */
export interface NotificationDTO {
  id: string;
  type: string;
  category: NotificationCategory;
  title: string;
  body: string | null;
  href: string | null;
  projectCode: string | null;
  actor: { name: string | null; initials: string | null } | null;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationRow {
  id: string;
  type: string;
  title: string;
  body: string | null;
  href: string | null;
  readAt: Date | null;
  createdAt: Date;
}

export function toNotificationDTO(
  row: NotificationRow,
  related: {
    projectCode?: string | null;
    actor?: { name: string | null; initials: string | null } | null;
  } = {},
): NotificationDTO {
  return {
    id: row.id,
    type: row.type,
    category: isNotificationType(row.type) ? categoryOf(row.type) : "updates",
    title: row.title,
    body: row.body,
    href: row.href,
    projectCode: related.projectCode ?? null,
    actor: related.actor ?? null,
    readAt: row.readAt ? row.readAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Who actually gets a row: each recipient once, never the person who caused
 * it, and nobody who switched the category off in-app.
 */
export function resolveRecipients(
  recipients: readonly string[],
  actorId: string | null | undefined,
  mutedUserIds: ReadonlySet<string>,
): string[] {
  const out: string[] = [];
  for (const id of recipients) {
    if (!id || id === actorId || mutedUserIds.has(id) || out.includes(id)) continue;
    out.push(id);
  }
  return out;
}

/**
 * Users addressed with `@Name` in a message. Case-insensitive substring
 * match, the same rule the chat mention search applies, so a person is told
 * about exactly the messages that search would later show them.
 */
export function mentionedUserIds(
  content: string,
  candidates: readonly { id: string; name: string | null }[],
): string[] {
  if (!content.includes("@")) return [];
  const haystack = content.toLowerCase();
  const out: string[] = [];
  for (const { id, name } of candidates) {
    const needle = name?.trim().toLowerCase();
    if (!needle) continue;
    if (haystack.includes(`@${needle}`) && !out.includes(id)) out.push(id);
  }
  return out;
}

/** First line of a message or summary, cut for the bell. */
export function excerpt(text: string | null | undefined, max = 140): string | null {
  if (!text) return null;
  const oneLine = text.replace(/\s+/g, " ").trim();
  if (!oneLine) return null;
  return oneLine.length > max ? `${oneLine.slice(0, max - 1).trimEnd()}…` : oneLine;
}
