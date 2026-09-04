import Pusher from "pusher";

export const pusherServer = new Pusher({
  appId: process.env.PUSHER_APP_ID!,
  key: process.env.PUSHER_KEY!,
  secret: process.env.PUSHER_SECRET!,
  cluster: process.env.PUSHER_CLUSTER!,
  useTLS: true,
});

export const PUSHER_EVENTS = {
  NEW_MESSAGE: "new-message",
  EDIT_MESSAGE: "edit-message",
  DELETE_MESSAGE: "delete-message",
  REACTION_ADD: "reaction-add",
  REACTION_REMOVE: "reaction-remove",
  TYPING_START: "client-typing-start",
  TYPING_STOP: "client-typing-stop",
  /*
   * A project row changed: edited, created, deleted, or its team
   * altered. Carries the id only. Like the chat events, this is an
   * invalidation and not a data channel — the receiver re-reads through
   * the API, which checks what that particular caller may see.
   */
  PROJECT_CHANGED: "project-changed",
  CALL_STARTED: "call-started",
  CALL_ENDED: "call-ended",
} as const;

export function channelName(channelId: string) {
  return `private-channel-${channelId}`;
}

export function presenceChannelName() {
  return "presence-workspace";
}
