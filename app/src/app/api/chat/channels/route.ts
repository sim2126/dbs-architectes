import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/platform/db";
import { authorize, loadSubject } from "@/platform/authz";
import { rateLimit, rateLimitedResponse } from "@/platform/auth/rate-limit";
import { channelAccessWhere } from "@/features/chat/server/channel-access";
import { parseChannelCreateInput } from "@/features/chat/domain/channel-input";

export async function GET() {
  const subject = await loadSubject();
  if (!subject) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const readDecision = authorize(subject, "chat:read", null);
  if (!readDecision.allow) {
    return Response.json({ error: readDecision.reason }, { status: 403 });
  }

  const channels = await prisma.channel.findMany({
    where: channelAccessWhere(subject),
    include: {
      members: {
        include: {
          user: {
            select: {
              id: true,
              name: true,
              initials: true,
              image: true,
              isExternal: true,
            },
          },
        },
      },
      _count: { select: { messages: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const memberChannelIds = channels
    .filter((channel) => channel.members.some((member) => member.userId === subject.userId))
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

  return Response.json(
    channels.map((channel) => ({
      ...channel,
      unread: unreadByChannel.get(channel.id) ?? 0,
    })),
  );
}

export async function POST(request: NextRequest) {
  const subject = await loadSubject();
  if (!subject) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const readDecision = authorize(subject, "chat:read", null);
  if (!readDecision.allow) {
    return Response.json({ error: readDecision.reason }, { status: 403 });
  }
  const createDecision = authorize(subject, "chat:channel.create", null);
  if (!createDecision.allow) {
    return Response.json({ error: createDecision.reason }, { status: 403 });
  }
  const createLimit = rateLimit(subject.userId, {
    key: "chat-channel-create",
    limit: 10,
    windowMs: 60 * 60 * 1000,
  });
  if (!createLimit.allowed) {
    return rateLimitedResponse(
      createLimit.retryAfterMs,
      "Too many channels created. Please wait before creating another.",
    );
  }

  const parsed = parseChannelCreateInput(await request.json().catch(() => null));
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });

  const memberIds = parsed.value.memberIds.filter((id) => id !== subject.userId);
  if (parsed.value.type === "direct" && memberIds.length !== 1) {
    return Response.json(
      { error: "A direct conversation must have exactly one other member" },
      { status: 400 },
    );
  }

  if (memberIds.length > 0) {
    const memberDecision = authorize(subject, "chat:members.manage", {
      kind: "chat",
      channelId: "new",
      channelOwnerId: subject.userId,
    });
    if (!memberDecision.allow) {
      return Response.json({ error: memberDecision.reason }, { status: 403 });
    }
    const activeUsers = await prisma.user.findMany({
      where: { id: { in: memberIds }, isActive: true },
      select: { id: true },
    });
    if (activeUsers.length !== memberIds.length) {
      return Response.json(
        { error: "Every channel member must be an active workspace user" },
        { status: 400 },
      );
    }
  }

  const participantIds = [subject.userId, ...memberIds];
  const memberInclude = {
    members: {
      include: {
        user: {
          select: {
            id: true,
            name: true,
            initials: true,
            image: true,
            isExternal: true,
          },
        },
      },
    },
  } as const;
  const name =
    parsed.value.type === "direct"
      ? `dm-${participantIds.slice().sort().join("-")}`
      : parsed.value.name;

  if (parsed.value.type === "direct") {
    const channel = await prisma.$transaction(async (tx) => {
      const directKey = `direct:${participantIds.slice().sort().join(":")}`;
      await tx.$queryRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${directKey}, 0))`,
      );

      const candidates = await tx.channel.findMany({
        where: {
          type: "direct",
          members: { some: { userId: subject.userId } },
        },
        include: memberInclude,
      });
      const expected = new Set(participantIds);
      const existing = candidates.find(
        (candidate) =>
          candidate.members.length === expected.size &&
          candidate.members.every((member) => expected.has(member.userId)),
      );
      if (existing) return existing;

      return tx.channel.create({
        data: {
          name,
          description: parsed.value.description,
          type: "direct",
          createdBy: subject.userId,
          members: {
            create: [
              { userId: subject.userId, role: "owner" },
              ...memberIds.map((userId) => ({ userId, role: "member" })),
            ],
          },
        },
        include: memberInclude,
      });
    });
    return Response.json(channel, { status: 201 });
  }

  const channel = await prisma.channel.create({
    data: {
      name,
      description: parsed.value.description,
      type: parsed.value.type,
      createdBy: subject.userId,
      members: {
        create: [
          { userId: subject.userId, role: "owner" },
          ...memberIds.map((userId) => ({ userId, role: "member" })),
        ],
      },
    },
    include: memberInclude,
  });

  return Response.json(channel, { status: 201 });
}
