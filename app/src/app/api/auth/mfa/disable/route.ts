/**
 * POST /api/auth/mfa/disable — turn MFA off.
 *
 * Requires the user's current password — turning off a security
 * factor MUST cost something more than a stolen-cookie session, or
 * the factor is decorative. We deliberately do NOT also require a
 * fresh TOTP code: the password is the second factor here, sufficient
 * for the unrolled UX where users sometimes lose their authenticator
 * and need a recovery path.
 *
 * Body: { password: string }.
 */

import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { auth } from "@/platform/auth";
import { prisma } from "@/platform/db";
import { pendoTrack } from "@/platform/integrations/pendo";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await request.json().catch(() => null)) as { password?: string } | null;
  if (!body?.password) {
    return Response.json({ error: "Password is required" }, { status: 400 });
  }
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { password: true, mfaEnabledAt: true },
  });
  if (!user?.password) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!user.mfaEnabledAt) {
    return Response.json({ ok: true, alreadyDisabled: true });
  }
  const ok = await bcrypt.compare(body.password, user.password);
  if (!ok) {
    return Response.json({ error: "Wrong password." }, { status: 400 });
  }
  await prisma.user.update({
    where: { id: session.user.id },
    data: { mfaEnabledAt: null, mfaSecret: null },
  });

  pendoTrack("mfa_disabled", { visitorId: session.user.id });

  return Response.json({ ok: true });
}
