/**
 * Admin operations on a specific invitation (by row id, not token).
 *   DELETE → revoke
 *   POST   → resend (rotates the token, mails again, extends expiry)
 *
 * Token rotation on resend is deliberate: the old link goes dead the
 * moment a new one is issued. If the original mail was lost or sent
 * to the wrong address, the previous token can't be used by an
 * accidental recipient who finds it later.
 */

import { NextRequest } from "next/server";
import { prisma } from "@/platform/db";
import {
  PermissionError,
  permissionResponse,
  requirePermission,
} from "@/platform/authz";
import { issueToken, INVITATION_TTL_MS } from "@/platform/auth/tokens";
import { sendEmail } from "@/platform/email/send";
import { safeInvitationRole } from "@/features/users/domain/guests";

function inviteUrl(req: NextRequest, token: string): string {
  const origin = req.headers.get("origin") ?? new URL(req.url).origin;
  return `${origin}/invite/${encodeURIComponent(token)}`;
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requirePermission(request, "user:invite", {
      context: { route: "DELETE /api/invitations/:id" },
    });
  } catch (e) {
    if (e instanceof PermissionError) return permissionResponse(e);
    throw e;
  }
  const { id } = await params;

  const existing = await prisma.invitation.findUnique({ where: { id } });
  if (!existing) return Response.json({ error: "Not found" }, { status: 404 });

  if (existing.status !== "pending") {
    return Response.json(
      { error: `Invitation is already ${existing.status}` },
      { status: 409 },
    );
  }

  await prisma.invitation.update({
    where: { id },
    data: { status: "revoked" },
  });
  return Response.json({ success: true });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  let actorName: string | null = null;
  try {
    const { subject } = await requirePermission(request, "user:invite", {
      context: { route: "POST /api/invitations/:id (resend)" },
    });
    const inviter = await prisma.user.findUnique({
      where: { id: subject.userId },
      select: { name: true },
    });
    actorName = inviter?.name ?? null;
  } catch (e) {
    if (e instanceof PermissionError) return permissionResponse(e);
    throw e;
  }

  const { id } = await params;
  const existing = await prisma.invitation.findUnique({ where: { id } });
  if (!existing) return Response.json({ error: "Not found" }, { status: 404 });
  if (existing.status !== "pending") {
    return Response.json(
      { error: `Cannot resend a ${existing.status} invitation` },
      { status: 409 },
    );
  }

  const { raw, hash } = issueToken();
  const expiresAt = new Date(Date.now() + INVITATION_TTL_MS);

  const updated = await prisma.invitation.update({
    where: { id },
    data: {
      tokenHash: hash,
      expiresAt,
      role: safeInvitationRole(existing.role, existing.isExternal),
    },
    select: {
      id: true, email: true, role: true, isExternal: true, status: true,
      expiresAt: true, createdAt: true,
    },
  });

  const url = inviteUrl(request, raw);
  const inviterLabel = actorName ?? "An admin";
  const sendResult = await sendEmail({
    to: updated.email,
    subject: `${inviterLabel} re-sent your invitation to DBS Friday`,
    text: [
      `Hello,`,
      ``,
      updated.isExternal
        ? `${inviterLabel} re-sent your invitation to a guest conversation in DBS Friday.`
        : `${inviterLabel} re-sent your invitation to join DBS Friday as a ${updated.role}.`,
      ``,
      `Set your password and join the workspace here (this link replaces the previous one and expires in 7 days):`,
      `  ${url}`,
      ``,
      `— DBS Friday`,
    ].join("\n"),
  });

  return Response.json({
    invitation: updated,
    inviteUrl: sendResult.deliveredVia === "dev-log" ? url : null,
    deliveredVia: sendResult.deliveredVia,
  });
}
