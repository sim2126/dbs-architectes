/**
 * POST /api/auth/forgot-password
 *
 * Anti-enumeration: ALWAYS returns 200 ok, whether the email is
 * registered or not. An attacker cannot use this endpoint to test
 * whether an address has an account.
 *
 * Rate-limited per IP so it can't be used as a free email-sending
 * service.
 */

import { NextRequest } from "next/server";
import { prisma } from "@/platform/db";
import { issueToken, PASSWORD_RESET_TTL_MS } from "@/platform/auth/tokens";
import { sendEmail } from "@/platform/email/send";
import { clientIp, rateLimit, rateLimitedResponse } from "@/platform/auth/rate-limit";
import { pendoTrack } from "@/platform/integrations/pendo";

function resetUrl(req: NextRequest, token: string): string {
  const origin = req.headers.get("origin") ?? new URL(req.url).origin;
  return `${origin}/reset/${encodeURIComponent(token)}`;
}

export async function POST(request: NextRequest) {
  const ip = clientIp(request);
  const { allowed, retryAfterMs } = rateLimit(ip, {
    key: "forgot-password",
    limit: 5,
    windowMs: 60_000,
  });
  if (!allowed) return rateLimitedResponse(retryAfterMs);

  const body = (await request.json().catch(() => null)) as { email?: string } | null;
  if (!body?.email) {
    return Response.json({ error: "Email is required." }, { status: 400 });
  }
  const email = body.email.trim().toLowerCase();

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, name: true, isActive: true },
  });

  // Send mail only if a real, active user exists — but ALWAYS return
  // the same shape so the caller can't distinguish.
  if (user && user.isActive) {
    const { raw, hash } = issueToken();
    const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MS);

    await prisma.passwordReset.create({
      data: { userId: user.id, tokenHash: hash, expiresAt },
    });

    const url = resetUrl(request, raw);
    await sendEmail({
      to: user.email,
      subject: "Reset your DBS Friday password",
      text: [
        `Hello${user.name ? " " + user.name : ""},`,
        ``,
        `Someone (hopefully you) requested a password reset for your DBS Friday account.`,
        `Click the link below to set a new password (expires in 1 hour):`,
        ``,
        `  ${url}`,
        ``,
        `If this wasn't you, ignore this message — your password stays unchanged.`,
        ``,
        `— DBS Friday`,
      ].join("\n"),
    });
  }

  pendoTrack("password_reset_requested");

  // Always return the same opaque success.
  return Response.json({ ok: true });
}
