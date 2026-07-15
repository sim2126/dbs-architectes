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
import { pendoTrack } from "@/platform/integrations/pendo-track";

async function findValidInvitation(rawToken: string) {
  const tokenHash = hashToken(rawToken);
  const invitation = await prisma.invitation.findUnique({
    where: { tokenHash },
    select: {
      id: true,
      email: true,
      role: true,
      status: true,
      expiresAt: true,
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
    role: invitation.role,
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
        role: invitation.role,
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
    return created;
  });

  pendoTrack("invitation_accepted", {
    visitorId: user.id,
    properties: {
      role: invitation.role,
      inviter_id: invitation.inviter?.name ?? "",
    },
  });

  return Response.json({ ok: true, email: user.email });
}
