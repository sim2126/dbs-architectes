/**
 * DELETE /api/auth/sessions/:id — revoke one of the caller's own
 * sessions.
 *
 * Only allowed if the session row's userId matches the caller — you
 * cannot revoke someone else's session via this endpoint. Admin
 * revocation of another user's sessions goes through user management
 * (Phase 4 follow-up: add an admin variant if needed).
 *
 * Revoking the CURRENT session is allowed and harmless — the next
 * request from that JWT lands at /login on the next nav. Useful for
 * "sign out everywhere" by revoking all but no-op.
 */

import { NextRequest } from "next/server";
import { auth } from "@/platform/auth";
import { prisma } from "@/platform/db";
import { pendoTrack } from "@/platform/integrations/pendo";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;

  const row = await prisma.userSession.findUnique({
    where: { id },
    select: { id: true, userId: true, revokedAt: true },
  });
  if (!row || row.userId !== session.user.id) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  if (row.revokedAt) {
    return Response.json({ ok: true, alreadyRevoked: true });
  }
  await prisma.userSession.update({
    where: { id: row.id },
    data: { revokedAt: new Date() },
  });

  pendoTrack("session_revoked", {
    visitorId: session.user.id,
    properties: {
      isCurrentSession: session.user.sessionId === id,
    },
  });

  return Response.json({ ok: true });
}
