/**
 * POST /api/auth/mfa/confirm — verify a TOTP code and enable MFA.
 *
 * Body: { code: string }. Reads the previously-stored secret from
 * the user row (placed there by /api/auth/mfa/setup), verifies the
 * code, and flips mfaEnabledAt on success.
 *
 * If the code doesn't verify, the secret stays on the user row so
 * the user can retry without re-scanning the QR. If the user
 * abandons enrollment, the secret remains harmless on the row
 * (MFA is OFF until mfaEnabledAt is set).
 */

import { NextRequest } from "next/server";
import { auth } from "@/platform/auth";
import { prisma } from "@/platform/db";
import { verifySync } from "otplib";
import { pendoTrack } from "@/platform/integrations/pendo";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await request.json().catch(() => null)) as { code?: string } | null;
  const code = body?.code?.replace(/\s/g, "").trim();
  if (!code) {
    return Response.json({ error: "Code is required" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { mfaSecret: true, mfaEnabledAt: true },
  });
  if (!user || !user.mfaSecret) {
    return Response.json(
      { error: "Start enrollment first." },
      { status: 409 },
    );
  }
  if (user.mfaEnabledAt) {
    return Response.json({ ok: true, alreadyEnabled: true });
  }
  const result = verifySync({
    token: code,
    secret: user.mfaSecret,
    epochTolerance: 1,
  });
  if (!result.valid) {
    return Response.json(
      { error: "That code didn't verify. Check the clock on your device and try again." },
      { status: 400 },
    );
  }
  await prisma.user.update({
    where: { id: session.user.id },
    data: { mfaEnabledAt: new Date() },
  });

  pendoTrack("mfa_enabled", { visitorId: session.user.id });

  return Response.json({ ok: true });
}
