import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

// ── Access gate ───────────────────────────────────────────────────────────────
// Admins and super_admins can access any project thread.
// Project managers can access any project thread (firm-wide visibility).
// Other roles must be assigned to the project.

async function assertProjectAccess(projectId: string, userId: string, role: string) {
  const managerRoles = new Set(["admin", "super_admin", "project_manager"]);
  if (managerRoles.has(role)) return true;

  const assignment = await prisma.projectAssignment.findUnique({
    where: { projectId_userId: { projectId, userId } },
    select: { userId: true },
  });

  return assignment !== null;
}

// ── Get (or lazily create) the project thread channel ────────────────────────
// The channel is only created/joined if the caller already has access.

async function getOrCreateThreadChannel(projectId: string, userId: string) {
  let channel = await prisma.channel.findFirst({
    where: { projectId, type: "project" },
  });

  if (!channel) {
    channel = await prisma.channel.create({
      data: {
        name:      `project-${projectId}`,
        type:      "project",
        projectId,
        createdBy: userId,
      },
    });
  }

  // Ensure the caller is a member so they get Pusher events
  await prisma.channelMember.upsert({
    where:  { channelId_userId: { channelId: channel.id, userId } },
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

  const hasAccess = await assertProjectAccess(id, session.user.id, session.user.role);
  if (!hasAccess) return Response.json({ error: "Forbidden" }, { status: 403 });

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

  const hasAccess = await assertProjectAccess(id, session.user.id, session.user.role);
  if (!hasAccess) return Response.json({ error: "Forbidden" }, { status: 403 });

  const { content, parentId } = await request.json();
  if (!content?.trim()) return Response.json({ error: "Empty message" }, { status: 400 });

  const channel = await getOrCreateThreadChannel(id, session.user.id);

  const message = await prisma.message.create({
    data: {
      channelId: channel.id,
      userId:    session.user.id,
      content:   content.trim(),
      parentId:  parentId ?? null,
    },
    include: {
      user: { select: { id: true, name: true, initials: true, image: true, role: true } },
      replies: { where: { deletedAt: null } },
      reactions: true,
    },
  });

  try {
    const { default: Pusher } = await import("pusher");
    if (process.env.PUSHER_APP_ID) {
      const pusher = new Pusher({
        appId:   process.env.PUSHER_APP_ID!,
        key:     process.env.NEXT_PUBLIC_PUSHER_KEY!,
        secret:  process.env.PUSHER_SECRET!,
        cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER!,
      });
      await pusher.trigger(`project-thread-${id}`, "new-message", message);
    }
  } catch { /* Pusher unavailable — non-fatal */ }

  return Response.json(message);
}
