/**
 * Who is told about what. Each producer knows one workflow seam, works out
 * the audience from the live database, and hands a plain notification to
 * notify(). Route handlers call these after their own write has succeeded,
 * inside a try/catch, so a notification problem never fails the action.
 */

import { prisma } from "@/platform/db";
import { excerpt, mentionedUserIds } from "../domain/types";
import { notify } from "./notify";

async function actorName(actorId: string): Promise<string> {
  const user = await prisma.user.findUnique({ where: { id: actorId }, select: { name: true } });
  return user?.name?.trim() || "Someone";
}

/**
 * A structured status update was posted on a project. Everyone assigned to
 * the project hears about it, except the author.
 */
export async function notifyStatusPosted(args: {
  projectId: string;
  statusUpdateId: string;
  actorId: string;
  health: string;
  summary: string;
}): Promise<void> {
  const project = await prisma.project.findUnique({
    where: { id: args.projectId },
    select: { code: true, assignments: { select: { userId: true } } },
  });
  if (!project) return;

  const who = await actorName(args.actorId);
  const health = args.health.replace(/_/g, " ");
  await notify({
    recipients: project.assignments.map((a) => a.userId),
    actorId: args.actorId,
    type: "status_posted",
    title: `${who} posted a status update on ${project.code}: ${health}`,
    body: excerpt(args.summary),
    href: `/dashboard/projects?code=${encodeURIComponent(project.code)}`,
    projectId: args.projectId,
    dedupKey: `status:${args.statusUpdateId}`,
  });
}

/**
 * A chat message was posted. Three audiences, in priority order so nobody
 * is told twice about one message:
 *  - people addressed with @Name,
 *  - the author of the thread being replied to,
 *  - in a direct conversation, the other members.
 */
export async function notifyMessagePosted(args: {
  messageId: string;
  channelId: string;
  content: string;
  actorId: string;
  parentAuthorId: string | null;
}): Promise<void> {
  const channel = await prisma.channel.findUnique({
    where: { id: args.channelId },
    select: {
      name: true,
      type: true,
      projectId: true,
      members: { select: { user: { select: { id: true, name: true } } } },
      project: {
        select: { assignments: { select: { user: { select: { id: true, name: true } } } } },
      },
    },
  });
  if (!channel) return;

  // The audience is whoever can read the channel: explicit members, plus
  // the project team for a project channel. Same rule as channel access.
  const audience = new Map<string, { id: string; name: string | null }>();
  for (const m of channel.members) audience.set(m.user.id, m.user);
  for (const a of channel.project?.assignments ?? []) audience.set(a.user.id, a.user);

  const who = await actorName(args.actorId);
  const isDirect = channel.type === "direct";
  const where = isDirect ? "" : ` in #${channel.name}`;
  const href = `/dashboard/chat?channel=${encodeURIComponent(args.channelId)}`;
  const body = excerpt(args.content);
  const told = new Set<string>();

  const mentioned = mentionedUserIds(args.content, [...audience.values()]);
  if (mentioned.length > 0) {
    await notify({
      recipients: mentioned,
      actorId: args.actorId,
      type: "mentioned",
      title: `${who} mentioned you${where}`,
      body,
      href,
      projectId: channel.projectId,
      dedupKey: `mention:${args.messageId}`,
    });
    for (const id of mentioned) told.add(id);
  }

  if (args.parentAuthorId && !told.has(args.parentAuthorId)) {
    await notify({
      recipients: [args.parentAuthorId],
      actorId: args.actorId,
      type: "thread_reply",
      title: `${who} replied to your thread${where}`,
      body,
      href,
      projectId: channel.projectId,
      dedupKey: `reply:${args.messageId}`,
    });
    told.add(args.parentAuthorId);
  }

  if (isDirect) {
    const others = channel.members.map((m) => m.user.id).filter((id) => !told.has(id));
    if (others.length > 0) {
      await notify({
        recipients: others,
        actorId: args.actorId,
        type: "direct_message",
        title: `${who} sent you a message`,
        body,
        href,
        dedupKey: `dm:${args.messageId}`,
      });
    }
  }
}
