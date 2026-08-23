/**
 * GET  /api/invitations/accept?token=… → fetch invitation summary so
 *   the /invite/[token] page can show "You've been invited as X" and
 *   gate the form on validity.
 * POST /api/invitations/accept             → accept (creates the User,
 *   sets the password, marks invitation accepted). Caller still has
 *   to call signIn() client-side after the response.
 *
 * Anti-enumeration: invalid / expired / used tokens all return the
 * same 404 shape. We never reveal whether a token existed at any
 * point — only whether it's CURRENTLY valid for accept.
 *
 * Rate-limited: an attacker grinding tokens shouldn't get free
 * unlimited probes.
 */

import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/platform/db";
import { hashToken } from "@/platform/auth/tokens";
import { clientIp, rateLimit, rateLimitedResponse } from "@/platform/auth/rate-limit";
import { safeInvitationRole } from "@/features/users/domain/guests";

async function findValidInvitation(rawToken: string) {
  const tokenHash = hashToken(rawToken);
  const invitation = await prisma.invitation.findUnique({
    where: { tokenHash },
    select: {
      id: true,
      email: true,
      role: true,
      isExternal: true,
      status: true,
      expiresAt: true,
      invitedBy: true,
      inviter: { select: { name: true } },
    },
  });
  if (!invitation) return null;
  if (invitation.status !== "pending") return null;
  if (invitation.expiresAt.getTime() < Date.now()) return null;
  return invitation;
}

export async function GET(request: NextRequest) {
  const ip = clientIp(request);
  const { allowed, retryAfterMs } = rateLimit(ip, {
    key: "invitation-validate",
    limit: 30,
    windowMs: 60_000,
  });
  if (!allowed) return rateLimitedResponse(retryAfterMs);

  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token");
  if (!token) {
    return Response.json({ error: "Invitation not found or expired." }, { status: 404 });
  }

  const invitation = await findValidInvitation(token);
  if (!invitation) {
    return Response.json({ error: "Invitation not found or expired." }, { status: 404 });
  }

  return Response.json({
    email: invitation.email,
    role: safeInvitationRole(invitation.role, invitation.isExternal),
    isExternal: invitation.isExternal,
    inviterName: invitation.inviter?.name ?? null,
    expiresAt: invitation.expiresAt.toISOString(),
  });
}

export async function POST(request: NextRequest) {
  const ip = clientIp(request);
  const { allowed, retryAfterMs } = rateLimit(ip, {
    key: "invitation-accept",
    limit: 10,
    windowMs: 60_000,
  });
  if (!allowed) return rateLimitedResponse(retryAfterMs);

  const body = (await request.json().catch(() => null)) as
    | { token?: string; password?: string; name?: string }
    | null;
  if (!body?.token || !body?.password) {
    return Response.json(
      { error: "Token and password are required." },
      { status: 400 },
    );
  }
  if (body.password.length < 10) {
    return Response.json(
      { error: "Password must be at least 10 characters." },
      { status: 400 },
    );
  }

  const invitation = await findValidInvitation(body.token);
  if (!invitation) {
    return Response.json({ error: "Invitation not found or expired." }, { status: 404 });
  }

  // Final guard against a race where someone signed up via another
  // path while the invitation was open.
  const existingUser = await prisma.user.findUnique({
    where: { email: invitation.email },
  });
  if (existingUser) {
    await prisma.invitation.update({
      where: { id: invitation.id },
      data: { status: "accepted", acceptedAt: new Date(), acceptedUserId: existingUser.id },
    });
    return Response.json({ error: "An account already exists for this email. Sign in instead." }, { status: 409 });
  }

  const hashed = await bcrypt.hash(body.password, 10);
  const name = (body.name ?? invitation.email.split("@")[0]).trim();
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  // Create + accept atomically so we never end up with a user but
  // a still-pending invitation (or vice versa).
  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        email: invitation.email,
        name,
        initials,
        password: hashed,
        role: safeInvitationRole(invitation.role, invitation.isExternal),
        // Carried from the invitation rather than re-derived from the email
        // domain. The admin's decision at invite time is the source of
        // truth; re-deriving here could silently reclassify someone whose
        // address happens to sit on a workspace alias.
        isExternal: invitation.isExternal,
        isActive: true,
        employmentStatus: "active",
        emailVerified: new Date(), // accepting via emailed token verifies the address
      },
      select: { id: true, email: true, name: true, role: true },
    });
    await tx.invitation.update({
      where: { id: invitation.id },
      data: {
        status: "accepted",
        acceptedAt: new Date(),
        acceptedUserId: created.id,
      },
    });
    if (invitation.isExternal) {
      // A guest account is conversation-scoped. Give it one explicit,
      // useful entry point with the inviter instead of allowing the first
      // sign-in to land on an empty Chat screen.
      const participants = [invitation.invitedBy, created.id].sort();
      await tx.channel.create({
        data: {
          name: `dm-${participants.join("-")}`,
          type: "direct",
          createdBy: invitation.invitedBy,
          members: {
            create: [
              { userId: invitation.invitedBy, role: "owner" },
              { userId: created.id, role: "member" },
            ],
          },
        },
      });
    }
    return created;
  });

  return Response.json({ ok: true, email: user.email });
}
