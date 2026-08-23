import { auth } from "@/platform/auth";
import { prisma } from "@/platform/db";
import { redirect } from "next/navigation";
import { ChatClient } from "@/features/chat";
import { channelAccessWhere } from "@/features/chat/server/channel-access";
import { authorize, loadSubject } from "@/platform/authz";
import { Prisma } from "@prisma/client";

export default async function ChatPage() {
  const session = await auth({ allowExternal: true });
  if (!session) redirect("/login");
  const subject = await loadSubject();
  if (!subject) redirect("/login");
  if (!authorize(subject, "chat:read", null).allow) redirect("/dashboard");

  // Staff receive unread tracking for workspace public channels. Guests are
  // never auto-enrolled: their only entry point is an explicit membership.
  if (!subject.isExternal) {
    const publicChannels = await prisma.channel.findMany({
      where: { type: "public", projectId: null },
      select: { id: true },
    });
    for (const channel of publicChannels) {
      await prisma.channelMember.upsert({
        where: { channelId_userId: { channelId: channel.id, userId: subject.userId } },
        update: {},
        create: { channelId: channel.id, userId: subject.userId },
      });
    }
  }

  const channels = await prisma.channel.findMany({
    where: channelAccessWhere({
      userId: subject.userId,
      isExternal: subject.isExternal,
    }),
    include: {
      members: {
        include: { user: { select: { id: true, name: true, initials: true, image: true, isActive: true, isExternal: true } } },
      },
      _count: { select: { messages: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const memberChannelIds = channels
    .filter((channel) =>
      channel.members.some((member) => member.userId === subject.userId),
    )
    .map((channel) => channel.id);
  const unreadRows = memberChannelIds.length
    ? await prisma.$queryRaw<Array<{ channelId: string; unread: bigint }>>(Prisma.sql`
        SELECT m."channelId", COUNT(*) AS unread
        FROM "Message" m
        JOIN "ChannelMember" cm
          ON cm."channelId" = m."channelId"
         AND cm."userId" = ${subject.userId}
        WHERE m."channelId" IN (${Prisma.join(memberChannelIds)})
          AND m."createdAt" > cm."lastRead"
          AND m."deletedAt" IS NULL
        GROUP BY m."channelId"
      `)
    : [];
  const unreadByChannel = new Map(
    unreadRows.map((row) => [row.channelId, Number(row.unread)]),
  );
  const channelsWithUnread = channels.map((channel) => ({
    ...channel,
    unread: unreadByChannel.get(channel.id) ?? 0,
  }));

  const users = await prisma.user.findMany({
    where: subject.isExternal
      ? {
          isActive: true,
          channelMembers: {
            some: { channelId: { in: channels.map((channel) => channel.id) } },
          },
        }
      : { isActive: true },
    select: { id: true, name: true, initials: true, image: true, role: true, department: true, isExternal: true },
    orderBy: { name: "asc" },
  });

  return (
    <ChatClient
      initialChannels={JSON.parse(JSON.stringify(channelsWithUnread))}
      users={JSON.parse(JSON.stringify(users))}
      currentUser={JSON.parse(JSON.stringify(session.user))}
    />
  );
}
