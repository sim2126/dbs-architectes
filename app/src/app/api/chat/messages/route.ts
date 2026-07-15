import { NextRequest } from "next/server";
import { auth } from "@/platform/auth";
import { prisma } from "@/platform/db";
import { pusherServer, channelName, PUSHER_EVENTS } from "@/platform/integrations/pusher";
import { pendoTrack } from "@/platform/integrations/pendo-track";

function boundedLimit(value: string | null, fallback = 50, max = 100) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.floor(parsed), max);
}

// ── Access check ──────────────────────────────────────────────────────────────
// Public channels: any authenticated user can read/write.
// Project channels: any authenticated user can read (project threads are
//   access-controlled at the /api/projects/[id]/thread level).
// Private / direct channels: caller must be a ChannelMember row.

async function assertChannelAccess(channelId: string, userId: string) {
  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    select: {
      type: true,
      members: { where: { userId }, select: { userId: true } },
    },
  });

  if (!channel) return { ok: false, status: 404, error: "Channel not found" } as const;

  if (channel.type === "public") return { ok: true, channelType: channel.type } as const;

  if (channel.members.length === 0) {
    return { ok: false, status: 403, error: "Forbidden" } as const;
  }

  return { ok: true, channelType: channel.type } as const;
}

// ── GET /api/chat/messages ────────────────────────────────────────────────────
// ?channelId=  — standard paginated message fetch
// ?mention=    — search all accessible channels for messages mentioning that name

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const channelId = searchParams.get("channelId");
  const mention   = searchParams.get("mention");
  const cursor    = searchParams.get("cursor");
  const limit     = boundedLimit(searchParams.get("limit"));

  // ── Mention search mode ───────────────────────────────────────────────────
  if (mention) {
    const messages = await prisma.message.findMany({
      where: {
        content:   { contains: `@${mention}`, mode: "insensitive" },
        deletedAt: null,
        // Only from channels the calling user can access
        channel: {
          OR: [
            { type: "public" },
            { type: "project" },
            { members: { some: { userId: session.user.id } } },
          ],
        },
      },
      orderBy: { createdAt: "desc" },
      take: 30,
      include: {
        user: { select: { id: true, name: true, initials: true, image: true } },
        channel: { select: { id: true, name: true } },
      },
    });

    return Response.json(
      messages.map((m) => ({
        id:          m.id,
        content:     m.content,
        createdAt:   m.createdAt,
        channelId:   m.channelId,
        channelName: m.channel.name,
        user:        m.user,
      }))
    );
  }

  // ── Standard channel message fetch ────────────────────────────────────────
  if (!channelId) return Response.json({ error: "channelId required" }, { status: 400 });

  const access = await assertChannelAccess(channelId, session.user.id);
  if (!access.ok) return Response.json({ error: access.error }, { status: access.status });

  const messages = await prisma.message.findMany({
    where: {
      channelId,
      parentId:  null,
      deletedAt: null,
      ...(cursor ? { createdAt: { lt: new Date(cursor) } } : {}),
    },
    include: {
      user: { select: { id: true, name: true, initials: true, image: true, role: true } },
      reactions: {
        include: { user: { select: { id: true, name: true, initials: true } } },
      },
      replies: {
        where: { deletedAt: null },
        include: {
          user: { select: { id: true, name: true, initials: true, image: true } },
          reactions: { include: { user: { select: { id: true, name: true, initials: true } } } },
        },
        orderBy: { createdAt: "asc" },
        take: 5,
      },
    },
    orderBy: { createdAt: "desc" },
    take: limit + 1,
  });
  const hasMore = messages.length > limit;
  const page = hasMore ? messages.slice(0, limit) : messages;
  const nextCursor = hasMore ? page.at(-1)?.createdAt.toISOString() ?? null : null;

  // Update last-read timestamp (only for actual members of private/direct channels)
  if (access.channelType !== "public") {
    await prisma.channelMember.updateMany({
      where: { channelId, userId: session.user.id },
      data: { lastRead: new Date() },
    });
  }

  return Response.json({
    messages: page.reverse(),
    hasMore,
    nextCursor,
  });
}

// ── POST /api/chat/messages ───────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const {
    channelId,
    content,
    parentId,
    type: typeFromBody,
    fileUrl,
    fileName,
  } = body as {
    channelId?: string;
    content?: string;
    parentId?: string | null;
    type?: string;
    fileUrl?: string | null;
    fileName?: string | null;
  };

  const trimmedContent = (content ?? "").trim();
  const hasAttachment = Boolean(fileUrl && fileName);

  // A message must carry SOMETHING — text, or a file, or both. An empty
  // message with no attachment is a no-op the user didn't ask for.
  if (!channelId || (!trimmedContent && !hasAttachment)) {
    return Response.json(
      { error: "channelId and either content or an attachment are required" },
      { status: 400 },
    );
  }

  // Derive `type` server-side from the attachment shape so the client
  // can't lie about it. text < image < file.
  let resolvedType: string = typeFromBody ?? "text";
  if (hasAttachment) {
    const isImage = /\.(png|jpe?g|gif|webp|avif|svg|heic)$/i.test(fileName!);
    resolvedType = isImage ? "image" : "file";
  }

  // Enforce membership before allowing writes
  const access = await assertChannelAccess(channelId, session.user.id);
  if (!access.ok) return Response.json({ error: access.error }, { status: access.status });

  const message = await prisma.message.create({
    data: {
      channelId,
      userId:   session.user.id,
      content:  trimmedContent,
      type:     resolvedType,
      parentId: parentId ?? null,
      fileUrl:  hasAttachment ? fileUrl! : null,
      fileName: hasAttachment ? fileName! : null,
    },
    include: {
      user: { select: { id: true, name: true, initials: true, image: true, role: true } },
      reactions: { include: { user: { select: { id: true, name: true, initials: true } } } },
      replies: {
        include: { user: { select: { id: true, name: true, initials: true, image: true } } },
      },
    },
  });

  await pusherServer.trigger(channelName(channelId), PUSHER_EVENTS.NEW_MESSAGE, message);

  pendoTrack("chat_message_sent", {
    visitorId: session.user.id,
    properties: {
      channel_id: channelId,
      message_type: resolvedType,
      has_attachment: hasAttachment,
      is_reply: Boolean(parentId),
      content_length: trimmedContent.length,
      file_type: hasAttachment ? (fileName?.split(".").pop() ?? "") : "",
    },
  });

  return Response.json(message);
}
