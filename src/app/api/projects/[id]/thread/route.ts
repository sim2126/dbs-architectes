import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

// Helper: get or create the project thread channel
async function getOrCreateThreadChannel(projectId: string, userId: string) {
  let channel = await prisma.channel.findFirst({
    where: { projectId, type: "project" },
  });

  if (!channel) {
    channel = await prisma.channel.create({
      data: {
        name: `project-${projectId}`,
        type: "project",
        projectId,
        createdBy: userId,
      },
    });
  }

  // Auto-join the current user
  await prisma.channelMember.upsert({
    where: { channelId_userId: { channelId: channel.id, userId } },
    create: { channelId: channel.id, userId },
    update: {},
  });

  return channel;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const channel = await getOrCreateThreadChannel(id, session.user.id);

  const messages = await prisma.message.findMany({
    where: { channelId: channel.id, deletedAt: null, parentId: null },
    orderBy: { createdAt: "asc" },
    include: {
      user: { select: { id: true, name: true, initials: true, image: true, role: true } },
      replies: {
        where: { deletedAt: null },
        orderBy: { createdAt: "asc" },
        include: {
          user: { select: { id: true, name: true, initials: true, image: true, role: true } },
        },
      },
      reactions: {
        include: { user: { select: { id: true, name: true, initials: true } } },
      },
    },
  });

  return Response.json({ channelId: channel.id, messages });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { content, parentId } = await request.json();

  if (!content?.trim()) return Response.json({ error: "Empty message" }, { status: 400 });

  const channel = await getOrCreateThreadChannel(id, session.user.id);

  const message = await prisma.message.create({
    data: {
      channelId: channel.id,
      userId: session.user.id,
      content: content.trim(),
      parentId: parentId ?? null,
    },
    include: {
      user: { select: { id: true, name: true, initials: true, image: true, role: true } },
      replies: { where: { deletedAt: null } },
      reactions: true,
    },
  });

  // Trigger Pusher event for real-time if configured
  try {
    const { default: Pusher } = await import("pusher");
    if (process.env.PUSHER_APP_ID) {
      const pusher = new Pusher({
        appId: process.env.PUSHER_APP_ID!,
        key: process.env.NEXT_PUBLIC_PUSHER_KEY!,
        secret: process.env.PUSHER_SECRET!,
        cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER!,
      });
      await pusher.trigger(`project-thread-${id}`, "new-message", message);
    }
  } catch {}

  return Response.json(message);
}
