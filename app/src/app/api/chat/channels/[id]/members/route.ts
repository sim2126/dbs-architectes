import { NextRequest } from "next/server";
import { prisma } from "@/platform/db";
import { authorize, loadProjectForAuth, loadSubject } from "@/platform/authz";
import { rateLimit, rateLimitedResponse } from "@/platform/auth/rate-limit";
import { resolveChannelAccess } from "@/features/chat/server/channel-access";
import { addChannelMember } from "@/features/chat/server/add-channel-member";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const subject = await loadSubject();
  if (!subject) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const readDecision = authorize(subject, "chat:read", null);
  if (!readDecision.allow) {
    return Response.json({ error: readDecision.reason }, { status: 403 });
  }

  const { id: channelId } = await params;
  const access = await resolveChannelAccess(channelId, subject);
  if (!access.ok) return Response.json({ error: access.error }, { status: access.status });

  const body = (await request.json().catch(() => null)) as { userId?: unknown } | null;
  if (typeof body?.userId !== "string" || !body.userId || body.userId.length > 200) {
    return Response.json({ error: "A valid user is required" }, { status: 400 });
  }

  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    select: {
      type: true,
      createdBy: true,
      projectId: true,
      members: {
        where: { userId: subject.userId },
        select: { role: true },
        take: 1,
      },
    },
  });
  if (!channel) return Response.json({ error: "Channel not found" }, { status: 404 });
  if (channel.type === "direct") {
    return Response.json(
      { error: "Direct conversations cannot have additional members." },
      { status: 400 },
    );
  }

  if (channel.projectId) {
    // A project's first thread reader may be the Channel.createdBy value, but
    // that must not let a viewer/reviewer admit an outsider. Project guest
    // admission follows the same lead/director policy as team assignment.
    const project = await loadProjectForAuth(channel.projectId, subject.userId);
    if (!project) return Response.json({ error: "Project not found" }, { status: 404 });
    const projectDecision = authorize(subject, "project:assign", project);
    if (!projectDecision.allow) {
      return Response.json({ error: projectDecision.reason }, { status: 403 });
    }
  } else {
    const decision = authorize(subject, "chat:members.manage", {
      kind: "chat",
      channelId,
      channelOwnerId: channel.createdBy,
      channelMemberRole: channel.members[0]?.role ?? null,
    });
    if (!decision.allow) return Response.json({ error: decision.reason }, { status: 403 });
  }

  const memberLimit = rateLimit(subject.userId, {
    key: "chat-member-add",
    limit: 30,
    windowMs: 60 * 60 * 1000,
  });
  if (!memberLimit.allowed) {
    return rateLimitedResponse(
      memberLimit.retryAfterMs,
      "Too many member changes. Please wait before adding another person.",
    );
  }

  const target = await prisma.user.findFirst({
    where: { id: body.userId, isActive: true },
    select: { id: true, name: true, initials: true, image: true, isExternal: true },
  });
  if (!target) return Response.json({ error: "Active user not found" }, { status: 404 });
  if (channel.projectId && !target.isExternal) {
    return Response.json(
      { error: "Add internal colleagues through the project team." },
      { status: 400 },
    );
  }

  const member = await addChannelMember(channelId, target.id);

  return Response.json(member, { status: 201 });
}
