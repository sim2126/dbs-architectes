/**
 * Notifications feature — one row per person per thing worth telling them,
 * delivered to the bell over a personal Pusher channel.
 *
 * Server code (notify, producers, list) is deep-imported by route handlers
 * and stays out of client bundles.
 */
export {
  NOTIFICATION_TYPES,
  categoryOf,
  isNotificationType,
  type NotificationCategory,
  type NotificationDTO,
  type NotificationType,
} from "./domain/types";
