import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type") || "";
  const userId = searchParams.get("userId") || "";
  const projectId = searchParams.get("projectId") || "";
  const page = parseInt(searchParams.get("page") || "1");
  const limit = 30;

  const activities = await prisma.activity.findMany({
    where: {
      ...(type ? { type } : {}),
      ...(userId ? { userId } : {}),
      ...(projectId ? { projectId } : {}),
    },
    include: {
      user: { select: { id: true, name: true, initials: true, image: true } },
      project: { select: { id: true, title: true, code: true } },
    },
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * limit,
    take: limit,
  });

  const total = await prisma.activity.count({
    where: {
      ...(type ? { type } : {}),
      ...(userId ? { userId } : {}),
      ...(projectId ? { projectId } : {}),
    },
  });

  return Response.json({ activities, total, pages: Math.ceil(total / limit) });
}
