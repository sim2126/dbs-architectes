/**
 * POST /api/auth/mfa/setup — start MFA enrollment.
 *
 * Generates a fresh TOTP secret, stores it on the user row (but does
 * NOT mark MFA enabled — that happens on confirm). Returns the
 * secret + otpauth URI + a data-URL QR image for the UI.
 *
 * If MFA is already enabled, refuses — disable first, then re-enroll.
 * That avoids the footgun where an enrollment overwrites a working
 * factor and locks the user out if they don't complete confirm.
 *
 * The raw secret is stored in plaintext on the User row. DB is the
 * trust boundary; if it leaks, every MFA factor is compromised
 * anyway. Hardening this further is an infra concern (KMS encrypted
 * volume).
 */

import { auth } from "@/platform/auth";
import { prisma } from "@/platform/db";
import { generateSecret, generateURI } from "otplib";
import QRCode from "qrcode";

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { email: true, mfaEnabledAt: true },
  });
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (user.mfaEnabledAt) {
    return Response.json(
      { error: "MFA is already enabled. Disable it first to re-enroll." },
      { status: 409 },
    );
  }

  const secret = generateSecret();
  await prisma.user.update({
    where: { id: session.user.id },
    data: { mfaSecret: secret },
  });

  const otpauth = generateURI({
    issuer: "DBS Friday",
    label: user.email,
    secret,
  });
  const qrDataUrl = await QRCode.toDataURL(otpauth, { margin: 1, width: 220 });

  return Response.json({ secret, otpauth, qrDataUrl });
}
