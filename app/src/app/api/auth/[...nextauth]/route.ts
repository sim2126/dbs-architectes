import { NextRequest } from "next/server";
import { handlers } from "@/platform/auth";
import {
  clientIp,
  rateLimit,
  rateLimitedResponse,
} from "@/platform/auth/rate-limit";

export const GET = handlers.GET;

/**
 * POST gets a rate-limit veneer in front of NextAuth's handler.
 *
 * Why only POST: GET requests on the NextAuth route are
 * provider/session reads — they don't carry credentials and aren't
 * the abuse vector we care about. POST covers credential sign-in,
 * sign-out, and OAuth callbacks. We only rate-limit the credential
 * sign-in path (path ends with /callback/credentials) so OAuth
 * callbacks and sign-outs aren't throttled by the same budget.
 *
 * 10 requests / minute / IP. Generous enough that a typist mis-
 * keying a password isn't locked out; tight enough that a
 * credential-stuffer can't grind through a wordlist.
 */
export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  const isCredentialsSignIn = url.pathname.endsWith("/callback/credentials");

  if (isCredentialsSignIn) {
    const ip = clientIp(req);
    const { allowed, retryAfterMs } = rateLimit(ip, {
      key: "auth-credentials",
      limit: 10,
      windowMs: 60_000,
    });
    if (!allowed) {
      return rateLimitedResponse(
        retryAfterMs,
        "Too many sign-in attempts. Please wait a moment and try again.",
      );
    }
  }

  return handlers.POST(req);
}
