/**
 * POST /api/invitations — admin creates an invite
 * GET  /api/invitations — admin lists pending/recent invites
 *
 * Token is generated server-side. Only the raw token reaches the
 * invitee via email (or the dev-log fallback). The hash is stored.
 *
 * If an invite already exists for the email in "pending" status, we
 * revoke the old one and issue a new — admin clicking "Invite again"
 * shouldn't pile up active tokens.
 *
 * No-account-enumeration concern: this is an admin-gated endpoint, so
 * we DO return precise errors (e.g. "email already registered") —
 * admin needs to know. The public side (forgot-password) is the one
 * that has to be careful about enumeration.
 */

import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/platform/db";
import {
  PermissionError,
  permissionResponse,
  requirePermission,
} from "@/platform/authz";
import { issueToken, INVITATION_TTL_MS } from "@/platform/auth/tokens";
import { sendEmail } from "@/platform/email/send";
import { authorize } from "@/platform/authz";
import {
  isExternalAddress,
  safeInvitationRole,
  WORKSPACE_DOMAIN,
} from "@/features/users/domain/guests";

const PICKABLE_ROLES = new Set(["admin", "director", "manager", "employee", "intern"]);

function inviteUrl(req: NextRequest, token: string): string {
  const origin = req.headers.get("origin") ?? new URL(req.url).origin;
  return `${origin}/invite/${encodeURIComponent(token)}`;
}

export async function POST(request: NextRequest) {
  let actorUserId: string;
  let actorName: string | null = null;
  let actorSubject: Awaited<ReturnType<typeof requirePermission>>["subject"];
  try {
    const { subject } = await requirePermission(request, "user:invite", {
      context: { route: "POST /api/invitations" },
    });
    actorSubject = subject;
    actorUserId = subject.userId;
    const inviter = await prisma.user.findUnique({
      where: { id: actorUserId },
      select: { name: true },
    });
    actorName = inviter?.name ?? null;
  } catch (e) {
    if (e instanceof PermissionError) return permissionResponse(e);
    throw e;
  }

  const body = (await request.json().catch(() => null)) as
    | { email?: string; role?: string; isExternal?: boolean }
    | null;
  if (!body || typeof body.email !== "string" || !body.email.includes("@")) {
    return Response.json({ error: "Valid email is required" }, { status: 400 });
  }
  if (!body.role || !PICKABLE_ROLES.has(body.role)) {
    return Response.json({ error: "Invalid role" }, { status: 400 });
  }
  const email = body.email.trim().toLowerCase();

  // Guest admission is a separate, admin-only capability. Two checks, not
  // one: the caller's stated intent AND the address itself. Relying on the
  // flag alone would let a non-admin admit an outsider by omitting it;
  // relying on the domain alone would miss a guest on a workspace alias.
  const wantsGuest = body.isExternal === true;
  const looksExternal = isExternalAddress(email);
  const isExternal = wantsGuest || looksExternal;
  const effectiveRole = safeInvitationRole(body.role, isExternal);

  if (isExternal && !authorize(actorSubject, "user:invite.external", null).allow) {
    return Response.json(
      {
        error:
          `Only admins can invite people from outside ${WORKSPACE_DOMAIN}. ` +
          `Ask an admin to add this guest.`,
      },
      { status: 403 },
    );
  }

  // If a User already exists for this email, refuse — that's a
  // reactivation/role-change scenario, not an invite.
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return Response.json(
      { error: "A user with this email already exists. Edit their record instead." },
      { status: 409 },
    );
  }

  const { raw, hash } = issueToken();
  const expiresAt = new Date(Date.now() + INVITATION_TTL_MS);

  const invitation = await prisma.$transaction(async (tx) => {
    // Application-level revoke-then-create is not enough: two concurrent
    // requests can both revoke zero rows and leave two live bearer tokens.
    // Serialise replacement for this normalised address inside the database,
    // then perform both writes in the same transaction.
    await tx.$executeRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${email}, 0))`,
    );
    await tx.invitation.updateMany({
      where: { email, status: "pending" },
      data: { status: "revoked" },
    });
    return tx.invitation.create({
      data: {
        email,
        role: effectiveRole,
        isExternal,
        tokenHash: hash,
        invitedBy: actorUserId,
        expiresAt,
        status: "pending",
      },
      select: {
        id: true, email: true, role: true, isExternal: true, status: true,
        expiresAt: true, createdAt: true,
      },
    });
  }, { maxWait: 10_000, timeout: 15_000 });

  const url = inviteUrl(request, raw);
  const inviterLabel = actorName ?? "An admin";
  const sendResult = await sendEmail({
    to: email,
    subject: `${inviterLabel} invited you to DBS Friday`,
    text: [
      `Hello,`,
      ``,
      isExternal
        ? `${inviterLabel} invited you to a guest conversation in DBS Friday.`
        : `${inviterLabel} invited you to join DBS Friday as a ${effectiveRole}.`,
      ``,
      `Set your password and join the workspace here (link expires in 7 days):`,
      `  ${url}`,
      ``,
      `If you weren't expecting this, you can safely ignore the message.`,
      ``,
      `— DBS Friday`,
    ].join("\n"),
  });

  return Response.json({
    invitation,
    // When SMTP isn't configured, surface the link so the admin can
    // copy/paste it manually. Production: deliveredVia will be
    // "gmail-smtp" and the link is not echoed.
    inviteUrl: sendResult.deliveredVia === "dev-log" ? url : null,
    deliveredVia: sendResult.deliveredVia,
  }, { status: 201 });
}

export async function GET(request: NextRequest) {
  try {
    await requirePermission(request, "user:invite", {
      context: { route: "GET /api/invitations" },
    });
  } catch (e) {
    if (e instanceof PermissionError) return permissionResponse(e);
    throw e;
  }

  // Show pending + recently terminal (last 30 days) — invisible
  // "accepted weeks ago" rows are noise.
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const invitations = await prisma.invitation.findMany({
    where: {
      OR: [
        { status: "pending" },
        { createdAt: { gte: cutoff } },
      ],
    },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true, email: true, role: true, isExternal: true, status: true,
      expiresAt: true, acceptedAt: true, createdAt: true,
      inviter: { select: { name: true, initials: true } },
    },
  });

  return Response.json(invitations);
}
