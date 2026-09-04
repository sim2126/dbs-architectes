/**
 * Channel names shared by the server (trigger, authorise) and the browser
 * (subscribe). Pure strings, no SDK import, so either side can use it.
 */

/** Personal channel: only the user it names may subscribe. */
export function userChannelName(userId: string) {
  return `private-user-${userId}`;
}

export const USER_CHANNEL_PREFIX = "private-user-";

/** Event carrying one NotificationDTO to its recipient. */
export const NOTIFICATION_EVENT = "notification";
