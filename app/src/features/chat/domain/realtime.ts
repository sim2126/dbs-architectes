export type ChannelInvalidation = Readonly<{ channelId: string }>;

/**
 * Pusher carries only an invalidation. Message data is fetched again through
 * the authorised API so a stale socket subscription cannot receive content.
 */
export function channelInvalidation(channelId: string): ChannelInvalidation {
  return Object.freeze({ channelId });
}
