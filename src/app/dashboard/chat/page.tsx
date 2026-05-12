import { auth } from "@/platform/auth";
import { prisma } from "@/platform/db";
import { redirect } from "next/navigation";
import { ChatClient } from "./chat-client";

export default async function ChatPage() {
  const session = await auth();
  if (!session) redirect("/login");

  // Ensure user is a member of all public channels
  const publicChannels = await prisma.channel.findMany({ where: { type: "public" } });
  for (const ch of publicChannels) {
    await prisma.channelMember.upsert({
      where: { channelId_userId: { channelId: ch.id, userId: session.user.id } },
      update: {},
      create: { channelId: ch.id, userId: session.user.id },
    });
  }

  const channels = await prisma.channel.findMany({
    where: {
      OR: [
        { type: "public" },
        { members: { some: { userId: session.user.id } } },
      ],
    },
    include: {
      members: {
        include: { user: { select: { id: true, name: true, initials: true, image: true, isActive: true } } },
      },
      _count: { select: { messages: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const users = await prisma.user.findMany({
    where: { isActive: true },
    select: { id: true, name: true, initials: true, image: true, role: true, department: true },
    orderBy: { name: "asc" },
  });

  return (
    <ChatClient
      initialChannels={JSON.parse(JSON.stringify(channels))}
      users={JSON.parse(JSON.stringify(users))}
      currentUser={JSON.parse(JSON.stringify(session.user))}
    />
  );
}
