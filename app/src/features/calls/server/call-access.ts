import { prisma } from "@/platform/db";

const ADMIN_ROLES = new Set(["admin", "super_admin"]);

export async function canAccessCall(input: {
  callId: string;
  userId: string;
  role: string;
}): Promise<boolean> {
  if (ADMIN_ROLES.has(input.role)) return true;

  const call = await prisma.call.findFirst({
    where: {
      id: input.callId,
      OR: [
        { startedBy: input.userId },
        { participants: { some: { userId: input.userId } } },
        { project: { assignments: { some: { userId: input.userId } } } },
      ],
    },
    select: { id: true },
  });
  return Boolean(call);
}
