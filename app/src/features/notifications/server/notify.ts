import { prisma } from "@/platform/db";
import { pusherServer } from "@/platform/integrations/pusher";
import { NOTIFICATION_EVENT, userChannelName } from "@/platform/integrations/pusher-channels";
import {
  categoryOf,
  resolveRecipients,
  toNotificationDTO,
  type NotificationType,
} from "../domain/types";

export interface NotifyInput {
  /** User ids to tell. Duplicates and the actor are dropped. */
  recipients: readonly string[];
  /** Who caused it. Null for system-raised alerts (deadlines, digests). */
  actorId?: string | null;
  type: NotificationType;
  title: string;
  body?: string | null;
  /** Workspace-relative path the row opens. */
  href?: string | null;
  projectId?: string | null;
  /**
   * Same key for the same user is written once. Use it whenever the same
   * cause can fire twice (a retried request, a daily deadline sweep).
   */
  dedupKey?: string | null;
}

/**
 * Persist one notification per recipient and push it to each recipient's
 * personal channel.
 *
 * The rows are the record; the push is a courtesy. A Pusher failure is
 * logged and swallowed so the action that caused the notification never
 * fails because the bell could not be rung. Callers should still wrap this
 * in try/catch: a database failure here must not undo their own write.
 *
 * Returns the number of rows written (after dedup and preferences).
 */
export async function notify(input: NotifyInput): Promise<number> {
  const category = categoryOf(input.type);
  const candidates = [...new Set(input.recipients)].filter((id) => id && id !== input.actorId);
  if (candidates.length === 0) return 0;

  const muted = await prisma.notificationPreference.findMany({
    where: { userId: { in: candidates }, category, inApp: false },
    select: { userId: true },
  });
  const recipients = resolveRecipients(
    candidates,
    input.actorId,
    new Set(muted.map((m) => m.userId)),
  );
  if (recipients.length === 0) return 0;

  const rows = await prisma.notification.createManyAndReturn({
    data: recipients.map((userId) => ({
      userId,
      actorId: input.actorId ?? null,
      type: input.type,
      title: input.title,
      body: input.body ?? null,
      href: input.href ?? null,
      projectId: input.projectId ?? null,
      dedupKey: input.dedupKey ?? null,
    })),
    skipDuplicates: true,
    select: {
      id: true,
      userId: true,
      type: true,
      title: true,
      body: true,
      href: true,
      readAt: true,
      createdAt: true,
    },
  });
  if (rows.length === 0) return 0;

  // The related names are the same for every row, so look them up once.
  const [project, actor] = await Promise.all([
    input.projectId
      ? prisma.project.findUnique({ where: { id: input.projectId }, select: { code: true } })
      : null,
    input.actorId
      ? prisma.user.findUnique({
          where: { id: input.actorId },
          select: { name: true, initials: true },
        })
      : null,
  ]);

  try {
    const events = rows.map((row) => ({
      channel: userChannelName(row.userId),
      name: NOTIFICATION_EVENT,
      data: toNotificationDTO(row, { projectCode: project?.code ?? null, actor }),
    }));
    // Pusher accepts at most ten events per batch call.
    for (let i = 0; i < events.length; i += 10) {
      await pusherServer.triggerBatch(events.slice(i, i + 10));
    }
  } catch (error) {
    console.warn("[notifications] real-time delivery failed; rows are saved", error);
  }

  return rows.length;
}
