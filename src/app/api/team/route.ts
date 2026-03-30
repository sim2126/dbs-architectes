import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const users = await prisma.user.findMany({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      email: true,
      initials: true,
      image: true,
      role: true,
      department: true,
      phone: true,
      isActive: true,
    },
    orderBy: { name: "asc" },
  });

  return Response.json(users);
}
