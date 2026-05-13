/**
 * In-memory rate limiter — single-instance only.
 *
 * Token-bucket per (key, ip). The bucket window slides; each request
 * either decrements the budget or is told to retry after the bucket
 * resets.
 *
 * Why in-memory: single Vercel instance for the demo deploy, and the
 * dev server obviously. For multi-instance production (AWS ECS Fargate
 * with >1 task) this needs to move to Redis (Upstash, ElastiCache) so
 * the budget is shared across instances. The function signature is
 * shaped to make that swap mechanical — call site is unchanged.
 *
 * Anti-abuse priorities for THIS application:
 *   - Credential stuffing on /api/auth/callback/credentials
 *   - Invite/forgot-password endpoints (don't let an attacker enumerate
 *     emails by burning through tokens)
 *
 * What we explicitly do NOT do here:
 *   - Per-account locking after N fails. Live in the credential
 *     provider itself, not the rate limiter — locking by IP would let
 *     one bad actor lock out a legitimate user from a shared NAT.
 *   - Distributed coordination. See "swap to Redis" above.
 */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

export type RateLimitOptions = {
  /** Namespace for this limit (e.g. "auth-credentials"). */
  key: string;
  /** Max requests in `windowMs`. */
  limit: number;
  /** Window in milliseconds. */
  windowMs: number;
};

export type RateLimitResult = {
  allowed: boolean;
  retryAfterMs: number;
};

export function rateLimit(ip: string, opts: RateLimitOptions): RateLimitResult {
  const now = Date.now();
  const k = `${opts.key}:${ip}`;
  const b = buckets.get(k);

  if (!b || b.resetAt <= now) {
    buckets.set(k, { count: 1, resetAt: now + opts.windowMs });
    return { allowed: true, retryAfterMs: 0 };
  }

  if (b.count >= opts.limit) {
    return { allowed: false, retryAfterMs: b.resetAt - now };
  }

  b.count++;
  return { allowed: true, retryAfterMs: 0 };
}

/**
 * Extract a stable client identifier from request headers. Prefers
 * x-forwarded-for (set by Vercel/Cloudflare/ALB), falls back to
 * x-real-ip, then to "unknown".
 *
 * Single value extracted — x-forwarded-for is comma-separated when
 * the request passed through multiple proxies; we take the first
 * which is the originating client.
 */
export function clientIp(req: Request | { headers: Headers }): string {
  const h = "headers" in req ? req.headers : new Headers();
  const xff = h.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]?.trim() ?? "unknown";
  return h.get("x-real-ip") ?? "unknown";
}

/**
 * Helper that wraps the standard 429 response with the right
 * Retry-After header.
 */
export function rateLimitedResponse(retryAfterMs: number, message?: string): Response {
  const seconds = Math.max(1, Math.ceil(retryAfterMs / 1000));
  return Response.json(
    { error: message ?? "Too many requests. Please try again in a moment." },
    {
      status: 429,
      headers: {
        "Retry-After": String(seconds),
      },
    },
  );
}

// Periodic GC so the Map doesn't grow without bound under churn.
// Only registers in environments that have setInterval (skips Edge
// runtime where the timer isn't available).
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [k, b] of buckets.entries()) {
      if (b.resetAt <= now) buckets.delete(k);
    }
  }, 60_000).unref?.();
}
