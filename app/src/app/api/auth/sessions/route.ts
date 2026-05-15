/**
 * GET /api/auth/sessions — list the caller's own active sessions.
 *
 * Returns every non-revoked UserSession for the signed-in user with
 * the metadata needed for the "Active sessions" panel: ip, userAgent,
 * lastSeenAt, createdAt, and a `current` flag identifying the row
 * tied to the request's own JWT (so the UI can mark "This device").
 */

import { auth } from "@/platform/auth";
import { prisma } from "@/platform/db";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  type Row = {
    id: string;
    ip: string | null;
    userAgent: string | null;
    lastSeenAt: Date;
    createdAt: Date;
  };

  const rows = (await prisma.userSession.findMany({
    where: { userId: session.user.id, revokedAt: null },
    orderBy: { lastSeenAt: "desc" },
    select: {
      id: true,
      ip: true,
      userAgent: true,
      lastSeenAt: true,
      createdAt: true,
    },
  })) as Row[];

  return Response.json(
    rows.map((r) => ({
      ...r,
      lastSeenAt: r.lastSeenAt.toISOString(),
      createdAt: r.createdAt.toISOString(),
      current: r.id === session.user.sessionId,
    })),
  );
}
