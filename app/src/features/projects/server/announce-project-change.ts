/**
 * Tell every open board that a project changed.
 *
 * The board is a shared surface: several people at DBS have it open at once,
 * and without this one of them edits a row the others cannot see has moved.
 *
 * Publishes the id, never the row. A socket subscribed a moment ago may since
 * have lost access, so the receiver re-reads through the API and gets only
 * what it is allowed. Failure is logged and swallowed: the database write has
 * already happened and must not be undone because a broadcast did not land.
 */

import { presenceChannelName, pusherServer, PUSHER_EVENTS } from "@/platform/integrations/pusher";

export async function announceProjectChange(projectId: string): Promise<void> {
  try {
    await pusherServer.trigger(presenceChannelName(), PUSHER_EVENTS.PROJECT_CHANGED, {
      id: projectId,
    });
  } catch (error) {
    console.warn("[projects] real-time board update failed", error);
  }
}
