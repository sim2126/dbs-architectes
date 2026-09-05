import { NextRequest } from "next/server";
import { prisma } from "@/platform/db";
import { authorize, loadSubject } from "@/platform/authz";
import { rateLimit, rateLimitedResponse } from "@/platform/auth/rate-limit";
import {
  channelAccessWhere,
  resolveChannelAccess,
} from "@/features/chat/server/channel-access";
import { pusherServer, channelName, PUSHER_EVENTS } from "@/platform/integrations/pusher";
import { notifyMessagePosted } from "@/features/notifications/server/producers";
import { announceProjectChange } from "@/features/projects/server/announce-project-change";
import {
  fridayFileUrl,
  UploadReceiptError,
  verifyUploadReceipt,
} from "@/platform/integrations/upload-receipt";
import {
  UploadValidationError,
  verifyStoredUpload,
} from "@/platform/integrations/uploads";
import {
  decodeMessageCursor,
  encodeMessageCursor,
} from "@/features/chat/domain/message-cursor";
import { channelInvalidation } from "@/features/chat/domain/realtime";

const MAX_MESSAGE_CHARS = 20_000;

function boundedLimit(value: string | null, fallback = 50, max = 100) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.floor(parsed), max);
}

// ── Access check ──────────────────────────────────────────────────────────────
// Every mode below uses the canonical channel-access contract: staff public
// channels, live project assignments, or explicit private/DM membership;
// guests always require explicit membership.

// ── GET /api/chat/messages ────────────────────────────────────────────────────
// ?channelId=  — standard paginated message fetch
// ?mention=    — search all accessible channels for messages mentioning that name

export async function GET(request: NextRequest) {
  const subject = await loadSubject();
  if (!subject) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const readDecision = authorize(subject, "chat:read", null);
  if (!readDecision.allow) {
    return Response.json({ error: readDecision.reason }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const channelId = searchParams.get("channelId");
  const mention   = searchParams.get("mention");
  const threadId  = searchParams.get("threadId");
  const cursor    = searchParams.get("cursor");
  const limit     = boundedLimit(searchParams.get("limit"));
  const decodedCursor = decodeMessageCursor(cursor);
  if (cursor && !decodedCursor) {
    return Response.json({ error: "Invalid cursor" }, { status: 400 });
  }

  // Addressable thread lookup. The channel list carries only a five-reply
  // preview; this path intentionally returns the complete reply sequence.
  if (threadId) {
    const reference = await prisma.message.findFirst({
      where: {
        id: threadId,
        parentId: null,
        OR: [
          { deletedAt: null },
          { replies: { some: { deletedAt: null } } },
        ],
      },
      select: { channelId: true },
    });
    if (!reference) {
      return Response.json({ error: "Thread not found" }, { status: 404 });
    }

    const access = await resolveChannelAccess(reference.channelId, subject);
    if (!access.ok) {
      return Response.json({ error: access.error }, { status: access.status });
    }

    const thread = await prisma.message.findUnique({
      where: { id: threadId },
      include: {
        user: { select: { id: true, name: true, initials: true, image: true, role: true, isExternal: true } },
        reactions: {
          include: { user: { select: { id: true, name: true, initials: true, isExternal: true } } },
        },
        replies: {
          where: { deletedAt: null },
          include: {
            user: { select: { id: true, name: true, initials: true, image: true, isExternal: true } },
            reactions: {
              include: { user: { select: { id: true, name: true, initials: true, isExternal: true } } },
            },
          },
          orderBy: { createdAt: "asc" },
        },
        _count: { select: { replies: { where: { deletedAt: null } } } },
      },
    });
    if (!thread) return Response.json({ error: "Thread not found" }, { status: 404 });

    const { _count, ...threadPayload } = thread;
    return Response.json({
      thread: { ...threadPayload, replyCount: _count.replies },
    });
  }

  // ── Mention search mode ───────────────────────────────────────────────────
  if (mention) {
    const messages = await prisma.message.findMany({
      where: {
        content:   { contains: `@${mention}`, mode: "insensitive" },
        deletedAt: null,
        // Only from channels the calling user can access
        channel: {
          ...channelAccessWhere(subject),
        },
      },
      orderBy: { createdAt: "desc" },
      take: 30,
      include: {
        user: { select: { id: true, name: true, initials: true, image: true, isExternal: true } },
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

  const access = await resolveChannelAccess(channelId, subject);
  if (!access.ok) return Response.json({ error: access.error }, { status: access.status });

  const messages = await prisma.message.findMany({
    where: {
      channelId,
      parentId:  null,
      AND: [
        {
          OR: [
            { deletedAt: null },
            { replies: { some: { deletedAt: null } } },
          ],
        },
        ...(decodedCursor
          ? [{
              OR: [
                { createdAt: { lt: decodedCursor.createdAt } },
                {
                  createdAt: decodedCursor.createdAt,
                  id: { lt: decodedCursor.id },
                },
              ],
            }]
          : []),
      ],
    },
    include: {
      user: { select: { id: true, name: true, initials: true, image: true, role: true, isExternal: true } },
      reactions: {
        include: { user: { select: { id: true, name: true, initials: true, isExternal: true } } },
      },
      replies: {
        where: { deletedAt: null },
        include: {
          user: { select: { id: true, name: true, initials: true, image: true, isExternal: true } },
          reactions: { include: { user: { select: { id: true, name: true, initials: true } } } },
        },
        // Fetch the most recent preview, then restore chronological order in
        // the DTO below. `asc + take(5)` incorrectly showed the oldest five.
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 5,
      },
      _count: { select: { replies: { where: { deletedAt: null } } } },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
  });
  const hasMore = messages.length > limit;
  const page = hasMore ? messages.slice(0, limit) : messages;
  const last = hasMore ? page.at(-1) : null;
  const nextCursor = last
    ? encodeMessageCursor({ createdAt: last.createdAt, id: last.id })
    : null;

  // `updateMany` is a no-op for a public channel the caller has not joined.
  // For enrolled public/project members it must still advance lastRead, or
  // their unread badge can never return to zero.
  await prisma.channelMember.updateMany({
    where: { channelId, userId: subject.userId },
    data: { lastRead: new Date() },
  });

  return Response.json({
    messages: page.reverse().map(({ _count, ...message }) => ({
      ...message,
      replies: [...message.replies].reverse(),
      replyCount: _count.replies,
    })),
    hasMore,
    nextCursor,
  });
}

// ── POST /api/chat/messages ───────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const subject = await loadSubject();
  if (!subject) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const readDecision = authorize(subject, "chat:read", null);
  if (!readDecision.allow) {
    return Response.json({ error: readDecision.reason }, { status: 403 });
  }
  const postDecision = authorize(subject, "chat:post", null);
  if (!postDecision.allow) {
    return Response.json({ error: postDecision.reason }, { status: 403 });
  }
  const messageLimit = rateLimit(subject.userId, {
    key: "chat-message-post",
    limit: 60,
    windowMs: 60_000,
  });
  if (!messageLimit.allowed) {
    return rateLimitedResponse(
      messageLimit.retryAfterMs,
      "You're sending messages too quickly. Please wait a moment.",
    );
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  const {
    channelId,
    content,
    parentId,
    fileUrl,
    fileName,
    fileReceipt,
  } = body as {
    channelId?: string;
    content?: string;
    parentId?: string | null;
    fileUrl?: string | null;
    fileName?: string | null;
    fileReceipt?: string | null;
  };

  if (
    typeof channelId !== "string" ||
    (content !== undefined && typeof content !== "string") ||
    (parentId !== undefined && parentId !== null && typeof parentId !== "string") ||
    (fileUrl !== undefined && fileUrl !== null && typeof fileUrl !== "string") ||
    (fileName !== undefined && fileName !== null && typeof fileName !== "string") ||
    (fileReceipt !== undefined && fileReceipt !== null && typeof fileReceipt !== "string")
  ) {
    return Response.json({ error: "Invalid message payload" }, { status: 400 });
  }

  const trimmedContent = (content ?? "").trim();
  if (trimmedContent.length > MAX_MESSAGE_CHARS) {
    return Response.json(
      { error: `Messages are limited to ${MAX_MESSAGE_CHARS.toLocaleString("en-GB")} characters.` },
      { status: 400 },
    );
  }
  const hasAnyAttachmentField = Boolean(fileUrl || fileName || fileReceipt);
  const hasAttachment = Boolean(fileUrl && fileName && fileReceipt);
  if (hasAnyAttachmentField && !hasAttachment) {
    return Response.json(
      { error: "fileUrl, fileName and fileReceipt are required together" },
      { status: 400 },
    );
  }

  if (!channelId) {
    return Response.json({ error: "channelId is required" }, { status: 400 });
  }
  // Re-check live membership immediately before touching an uploaded object
  // or writing the message. A presign receipt does not preserve access after
  // a member or project assignment is revoked.
  const access = await resolveChannelAccess(channelId, subject);
  if (!access.ok) return Response.json({ error: access.error }, { status: access.status });

  if (hasAttachment) {
    try {
      const receipt = verifyUploadReceipt(fileReceipt!, subject.userId);
      if (
        receipt.purpose !== "chat" ||
        receipt.targetId !== channelId ||
        receipt.filename !== fileName ||
        fridayFileUrl(receipt.objectKey) !== fileUrl
      ) {
        throw new UploadReceiptError();
      }
      await verifyStoredUpload({
        key: receipt.objectKey,
        sizeBytes: receipt.sizeBytes,
        contentType: receipt.contentType,
      });
    } catch (error) {
      if (error instanceof UploadReceiptError || error instanceof UploadValidationError) {
        return Response.json({ error: error.message }, { status: 400 });
      }
      throw error;
    }
  }

  // A message must carry SOMETHING — text, or a file, or both. An empty
  // message with no attachment is a no-op the user didn't ask for.
  if (!trimmedContent && !hasAttachment) {
    return Response.json(
      { error: "channelId and either content or an attachment are required" },
      { status: 400 },
    );
  }

  let parentAuthorId: string | null = null;
  if (parentId) {
    const parent = await prisma.message.findUnique({
      where: { id: parentId },
      select: { channelId: true, parentId: true, deletedAt: true, userId: true },
    });
    if (
      !parent ||
      parent.channelId !== channelId ||
      parent.parentId !== null ||
      parent.deletedAt !== null
    ) {
      return Response.json({ error: "Thread not found in this channel" }, { status: 400 });
    }
    parentAuthorId = parent.userId;
  }

  // Derive `type` server-side from the attachment shape so the client
  // can't lie about it. text < image < file.
  let resolvedType = "text";
  if (hasAttachment) {
    const isImage = /\.(png|jpe?g|gif|webp|avif|heic|heif|bmp|tiff?)$/i.test(fileName!);
    resolvedType = isImage ? "image" : "file";
  }

  const message = await prisma.message.create({
    data: {
      channelId,
      userId:   subject.userId,
      content:  trimmedContent,
      type:     resolvedType,
      parentId: parentId ?? null,
      fileUrl:  hasAttachment ? fileUrl! : null,
      fileName: hasAttachment ? fileName! : null,
    },
    include: {
      user: { select: { id: true, name: true, initials: true, image: true, role: true, isExternal: true } },
      reactions: { include: { user: { select: { id: true, name: true, initials: true } } } },
      replies: {
        include: { user: { select: { id: true, name: true, initials: true, image: true } } },
      },
    },
  });

  try {
    // Publish an invalidation only. A socket whose membership was revoked
    // after subscribing must never continue receiving message contents.
    await pusherServer.trigger(
      channelName(channelId),
      PUSHER_EVENTS.NEW_MESSAGE,
      channelInvalidation(channelId),
    );
  } catch (error) {
    // The database write is authoritative. Returning 500 here invites the
    // client to retry a message that was already saved, creating duplicates.
    console.warn("[chat] real-time new-message delivery failed", error);
  }

  // Tell the people this message addresses: anyone mentioned, the author of
  // the thread replied to, and in a direct conversation the other members.
  // The saved message is the record; this must never fail the post.
  try {
    await notifyMessagePosted({
      messageId: message.id,
      channelId,
      content: trimmedContent,
      actorId: subject.userId,
      parentAuthorId,
    });
  } catch (error) {
    console.warn("[chat] notifications failed", error);
  }

  try {
    const channel = await prisma.channel.findUnique({ where: { id: channelId }, select: { projectId: true } });
    if (channel?.projectId) await announceProjectChange(channel.projectId);
  } catch (error) {
    console.warn("[chat] project invalidation failed", error);
  }

  return Response.json({ ...message, replyCount: 0 });
}
