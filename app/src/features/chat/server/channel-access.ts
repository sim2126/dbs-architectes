import { Prisma } from "@prisma/client";
import { prisma } from "@/platform/db";
import {
  canReadChannel,
  type ChannelViewer,
} from "../domain/channel-access";

export function channelAccessWhere(viewer: ChannelViewer): Prisma.ChannelWhereInput {
  if (viewer.isExternal) {
    return { members: { some: { userId: viewer.userId } } };
  }

  return {
    OR: [
      { type: "public", projectId: null },
      {
        projectId: null,
        members: { some: { userId: viewer.userId } },
      },
      {
        projectId: { not: null },
        project: { assignments: { some: { userId: viewer.userId } } },
      },
    ],
  };
}

export type ChannelAccessResult =
  | { ok: true; channelType: string }
  | { ok: false; status: 403 | 404; error: string };

export async function resolveChannelAccess(
  channelId: string,
  viewer: ChannelViewer,
): Promise<ChannelAccessResult> {
  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    select: {
      type: true,
      projectId: true,
      members: {
        where: { userId: viewer.userId },
        select: { id: true },
        take: 1,
      },
      project: {
        select: {
          assignments: {
            where: { userId: viewer.userId },
            select: { id: true },
            take: 1,
          },
        },
      },
    },
  });

  if (!channel) {
    return { ok: false, status: 404, error: "Channel not found" };
  }

  const allowed = canReadChannel(viewer, {
    type: channel.type,
    projectId: channel.projectId,
    isMember: channel.members.length > 0,
    isProjectAssignee: (channel.project?.assignments.length ?? 0) > 0,
  });
  if (!allowed) return { ok: false, status: 403, error: "Forbidden" };

  return { ok: true, channelType: channel.type };
}

export async function canAccessChannel(input: {
  channelId: string;
  userId: string;
  isExternal: boolean;
}): Promise<boolean> {
  return (await resolveChannelAccess(input.channelId, input)).ok;
}
