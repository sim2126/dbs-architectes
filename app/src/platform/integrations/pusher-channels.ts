/**
 * Channel names shared by the server (trigger, authorise) and the browser
 * (subscribe). Pure strings, no SDK import, so either side can use it.
 */

/** Personal channel: only the user it names may subscribe. */
export function userChannelName(userId: string) {
  return `private-user-${userId}`;
}

export const USER_CHANNEL_PREFIX = "private-user-";

/** ID-only notification invalidation; recipients fetch through live access checks. */
export const NOTIFICATION_EVENT = "notification";
