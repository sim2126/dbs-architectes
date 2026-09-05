import { prisma } from "@/platform/db";

/** Unique-key admission remains idempotent when several invitations arrive together. */
export async function addChannelMember(channelId: string, userId: string) {
  // A nested user include makes Prisma emulate upsert with a read followed by
  // create. Use the database conflict clause for the write, then load the DTO.
  await prisma.channelMember.createMany({
    data: [{ channelId, userId, role: "member" }],
    skipDuplicates: true,
  });
  return prisma.channelMember.findUniqueOrThrow({
    where: { channelId_userId: { channelId, userId } },
    include: {
      user: { select: { id: true, name: true, initials: true, image: true, isExternal: true } },
    },
  });
}
