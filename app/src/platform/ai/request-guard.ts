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

export type AiQuotaResult =
  | { allowed: true }
  | { allowed: false; retryAfterMs: number };

/** Carries the event id so a request that is throttled later in the handler
 *  can hand the slot back instead of spending it on work that never ran. */
export type AiQuotaConsumption =
  | { allowed: true; eventId: string }
  | { allowed: false; retryAfterMs: number };

export async function consumeAiRequestQuota(
  userId: string,
  now = new Date(),
): Promise<AiQuotaConsumption> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw(
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
  });
}

export async function acquireAiAgentLease(
  userId: string,
  requestId: string,
  now = new Date(),
): Promise<AiQuotaResult> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw(
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
  });
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
