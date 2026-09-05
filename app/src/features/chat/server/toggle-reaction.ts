import { Prisma } from "@prisma/client";

type ReactionKey = { messageId: string; userId: string; emoji: string };
interface ReactionStore {
  findUnique(args: { where: { messageId_userId_emoji: ReactionKey } }): Promise<{ id: string } | null>;
  deleteMany(args: { where: { id: string } }): Promise<unknown>;
  create(args: { data: ReactionKey }): Promise<unknown>;
}

/** Concurrent requests for the same observed state are idempotent on both paths. */
export async function toggleReaction(store: ReactionStore, key: ReactionKey): Promise<boolean> {
  const existing = await store.findUnique({ where: { messageId_userId_emoji: key } });
  if (existing) {
    // Another request may already have removed this exact row. A newly
    // created reaction has another id and must not be removed by a stale click.
    await store.deleteMany({ where: { id: existing.id } });
    return false;
  }
  try {
    await store.create({ data: key });
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) throw error;
  }
  return true;
}
