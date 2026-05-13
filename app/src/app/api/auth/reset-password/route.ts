/**
 * GET  /api/auth/reset-password?token=… → tells the page whether the
 *   token is currently usable (without revealing user info).
 * POST /api/auth/reset-password         → consume the token, update
 *   the user's password.
 *
 * Tokens are single-use, expiry-bounded. On successful reset, the
 * token's `usedAt` is set so it can't be replayed.
 *
 * NOTE: we do NOT proactively invalidate other live JWT sessions of
 * the user. With JWT-strategy NextAuth there is no server-side
 * session store to wipe; the live JWTs expire on their own
 * (configurable; default 30 days). That window is the practical
 * trade-off of the JWT strategy. Phase 3 introduces session-listing
 * + per-session revoke, which is the structural fix.
 */

import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/platform/db";
import { hashToken } from "@/platform/auth/tokens";
import { clientIp, rateLimit, rateLimitedResponse } from "@/platform/auth/rate-limit";

async function findValidReset(rawToken: string) {
  const tokenHash = hashToken(rawToken);
  const reset = await prisma.passwordReset.findUnique({
    where: { tokenHash },
    select: { id: true, userId: true, expiresAt: true, usedAt: true },
  });
  if (!reset) return null;
  if (reset.usedAt) return null;
  if (reset.expiresAt.getTime() < Date.now()) return null;
  return reset;
}

export async function GET(request: NextRequest) {
  const ip = clientIp(request);
  const { allowed, retryAfterMs } = rateLimit(ip, {
    key: "reset-validate",
    limit: 30,
    windowMs: 60_000,
  });
  if (!allowed) return rateLimitedResponse(retryAfterMs);

  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token");
  if (!token) {
    return Response.json({ error: "Reset link is invalid or expired." }, { status: 404 });
  }

  const reset = await findValidReset(token);
  if (!reset) {
    return Response.json({ error: "Reset link is invalid or expired." }, { status: 404 });
  }
  return Response.json({ ok: true });
}

export async function POST(request: NextRequest) {
  const ip = clientIp(request);
  const { allowed, retryAfterMs } = rateLimit(ip, {
    key: "reset-password",
    limit: 10,
    windowMs: 60_000,
  });
  if (!allowed) return rateLimitedResponse(retryAfterMs);

  const body = (await request.json().catch(() => null)) as
    | { token?: string; password?: string }
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

  const reset = await findValidReset(body.token);
  if (!reset) {
    return Response.json({ error: "Reset link is invalid or expired." }, { status: 404 });
  }

  const hashed = await bcrypt.hash(body.password, 10);
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: reset.userId },
      data: { password: hashed },
    });
    await tx.passwordReset.update({
      where: { id: reset.id },
      data: { usedAt: new Date() },
    });
  });

  return Response.json({ ok: true });
}
