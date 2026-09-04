import { Prisma } from "@prisma/client";
import { prisma } from "@/platform/db";

const REQUEST_LIMIT = 20;
const REQUEST_WINDOW_MS = 10 * 60 * 1000;
/**
 * Crash-recovery lease lifetime, tied to the route's execution ceiling.
 *
 * /api/agent declares `maxDuration = 120`, so the platform kills the function
 * at 120 seconds whatever the internal loop intends. A lease older than that
 * plus a margin is therefore abandoned by definition, and holding it any
 * longer only locks the user out of DBS AI.
 *
 * This was 20 minutes, which meant a single platform timeout — the case the
 * lease exists to recover from — took the assistant away from that user for
 * twenty minutes with no way back. The release runs in a `finally` inside the
 * stream, and a killed function never reaches it.
 *
 * If maxDuration on the route changes, change this with it.
 */
const LEASE_TTL_MS = 150 * 1000;

/*
 * Transaction options for the guard's two locks.
 *
 * Prisma waits 2 s by default to begin an interactive transaction. Neon
 * scales to zero when idle and took 1.58 s to answer SELECT 1 on wake, after
 * which the lock transaction itself needed ~0.8 s — so the very first AI
 * request after a quiet spell failed to start its transaction and the guard's
 * catch turned that into a spurious 503. Ten seconds is generous for a lock
 * that does almost nothing, and it is only ever paid on a cold start.
 */

export type AiQuotaResult =
  | { allowed: true }
  | { allowed: false; retryAfterMs: number };

/** Carries the event id so a request that is throttled later in the handler
 *  can hand the slot back instead of spending it on work that never ran. */
export type AiQuotaConsumption =
  | { allowed: true; eventId: string }
  | { allowed: false; retryAfterMs: number };

/*
 * Advisory locks go through $executeRaw, not $queryRaw.
 *
 * pg_advisory_xact_lock() returns void. Neon's driver adapter tolerates
 * decoding a void column; @prisma/adapter-pg refuses it with
 * UnsupportedNativeDataType, which surfaced as a 503 on every AI request the
 * moment the app ran against a plain PostgreSQL — and Aurora, the production
 * target, is a plain PostgreSQL. The lock's result is never read, so
 * $executeRaw is also the honest call. Same change in chat/channels and
 * invitations, which take the same lock the same way.
 */
export async function consumeAiRequestQuota(
  userId: string,
  now = new Date(),
): Promise<AiQuotaConsumption> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`ai-quota:${userId}`}, 0))`,
    );
    const windowStart = new Date(now.getTime() - REQUEST_WINDOW_MS);
    await tx.aiRequestEvent.deleteMany({
      where: { userId, createdAt: { lt: windowStart } },
    });
    const events = await tx.aiRequestEvent.findMany({
      where: { userId, createdAt: { gte: windowStart } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: REQUEST_LIMIT,
      select: { createdAt: true },
    });
    if (events.length >= REQUEST_LIMIT) {
      return {
        allowed: false,
        retryAfterMs: Math.max(
          1,
          events[0]!.createdAt.getTime() + REQUEST_WINDOW_MS - now.getTime(),
        ),
      };
    }
    const event = await tx.aiRequestEvent.create({
      data: { userId, createdAt: now },
      select: { id: true },
    });
    return { allowed: true, eventId: event.id };
  }, { maxWait: 10_000, timeout: 15_000 });
}

export async function acquireAiAgentLease(
  userId: string,
  requestId: string,
  now = new Date(),
): Promise<AiQuotaResult> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`ai-lease:${userId}`}, 0))`,
    );
    const current = await tx.aiAgentLease.findUnique({ where: { userId } });
    if (current && current.expiresAt > now) {
      return {
        allowed: false,
        retryAfterMs: Math.max(1, current.expiresAt.getTime() - now.getTime()),
      };
    }
    await tx.aiAgentLease.upsert({
      where: { userId },
      create: {
        userId,
        requestId,
        expiresAt: new Date(now.getTime() + LEASE_TTL_MS),
      },
      update: {
        requestId,
        expiresAt: new Date(now.getTime() + LEASE_TTL_MS),
        createdAt: now,
      },
    });
    return { allowed: true };
  }, { maxWait: 10_000, timeout: 15_000 });
}

/**
 * Hands a quota slot back.
 *
 * The quota is consumed early, before the session lookup and the concurrency
 * lease, so that an abusive caller is thrown out before doing database work.
 * The cost of that ordering is that a request rejected further down has
 * already spent a slot. This returns it, so a user who is refused for holding
 * a concurrent request does not also lose allowance for a request that never
 * reached the provider.
 */
export async function refundAiRequestQuota(eventId: string) {
  await prisma.aiRequestEvent.deleteMany({ where: { id: eventId } });
}

export async function releaseAiAgentLease(userId: string, requestId: string) {
  await prisma.aiAgentLease.deleteMany({ where: { userId, requestId } });
}
