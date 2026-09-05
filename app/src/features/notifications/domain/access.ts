import { authorize, type ProjectResource, type Subject } from "@/platform/authz/authorize";
import { canReadChannel, type ChannelAccessFacts } from "@/platform/authz/channel-access";

export type NotificationSource = { projectId?: string | null; href?: string | null };

export function notificationChannelId(source: NotificationSource): string | null {
  if (!source.href?.startsWith("/dashboard/chat?")) return null;
  return new URLSearchParams(source.href.slice(source.href.indexOf("?") + 1)).get("channel");
}

/** Apply the same live read decisions to notification excerpts as their source. */
export function canReadNotification(
  subject: Subject,
  source: NotificationSource,
  project: ProjectResource | null,
  channel: ChannelAccessFacts | null,
): boolean {
  if (notificationChannelId(source)) {
    if (!channel || !authorize(subject, "chat:read", null).allow || !canReadChannel(subject, channel)) {
      return false;
    }
    // Guests are explicitly admitted to conversations, not project surfaces.
    if (channel.projectId && !subject.isExternal) {
      return !!project && authorize(subject, "project:read", project).allow;
    }
    return true;
  }
  if (source.projectId) return !!project && authorize(subject, "project:read", project).allow;
  return true;
}

/** A former thread author is not an exception to the current channel audience. */
export function replyRecipient(
  parentAuthorId: string | null,
  audience: ReadonlySet<string>,
  alreadyTold: ReadonlySet<string>,
): string[] {
  return parentAuthorId && audience.has(parentAuthorId) && !alreadyTold.has(parentAuthorId)
    ? [parentAuthorId]
    : [];
}
