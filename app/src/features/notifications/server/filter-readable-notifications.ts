import { prisma } from "@/platform/db";
import type { Subject } from "@/platform/authz";
import { canReadNotification, notificationChannelId, type NotificationSource } from "../domain/access";

/** Resolve each source once; never fetch notification bodies before access is checked. */
export async function filterReadableNotifications<T extends NotificationSource>(
  subject: Subject,
  sources: readonly T[],
): Promise<T[]> {
  const canRead = await resolveNotificationSources(sources, [subject.userId]);
  return sources.filter((source) => canRead(subject, source));
}

/** Batch source facts once for a fan-out, rather than querying per recipient. */
export async function resolveNotificationSources(
  sources: readonly NotificationSource[],
  userIds: readonly string[],
): Promise<(subject: Subject, source: NotificationSource) => boolean> {
  const channelIds = [...new Set(sources.map(notificationChannelId).filter((id): id is string => !!id))];
  const channels = channelIds.length ? await prisma.channel.findMany({
    where: { id: { in: channelIds } },
    select: {
      id: true, type: true, projectId: true,
      members: { where: { userId: { in: [...userIds] } }, select: { userId: true } },
    },
  }) : [];
  const projectIds = [...new Set([
    ...sources.map((source) => source.projectId), ...channels.map((channel) => channel.projectId),
  ].filter((id): id is string => !!id))];
  const projects = projectIds.length ? await prisma.project.findMany({
    where: { id: { in: projectIds } },
    select: {
      id: true, country: true, operatingRegion: true,
      assignments: { where: { userId: { in: [...userIds] } }, select: { userId: true, role: true } },
    },
  }) : [];
  const projectById = new Map(projects.map((project) => [project.id, project]));
  const channelById = new Map(channels.map((channel) => [channel.id, channel]));
  return (subject, source) => {
    const channel = channelById.get(notificationChannelId(source) ?? "");
    const project = projectById.get(channel?.projectId ?? source.projectId ?? "");
    const assignment = project?.assignments.find((row) => row.userId === subject.userId);
    return canReadNotification(subject, source, project ? {
      kind: "project", id: project.id, country: project.country,
      operatingRegion: project.operatingRegion, assignmentRole: assignment?.role ?? null,
    } : null, channel ? {
      type: channel.type, projectId: channel.projectId,
      isMember: channel.members.some((row) => row.userId === subject.userId), isProjectAssignee: !!assignment,
    } : null);
  };
}
