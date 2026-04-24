import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

function boundedLimit(value: string | null, fallback = 30, max = 100) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.floor(parsed), max);
}

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type") || "";
  const userId = searchParams.get("userId") || "";
  const projectId = searchParams.get("projectId") || "";
  const cursor = searchParams.get("cursor") || "";
  const hasPage = searchParams.has("page");
  const page = parseInt(searchParams.get("page") || "1");
  const limit = boundedLimit(searchParams.get("limit"));
  const where = {
    ...(type ? { type } : {}),
    ...(userId ? { userId } : {}),
    ...(projectId ? { projectId } : {}),
  };

  const activities = await prisma.activity.findMany({
    where,
    include: {
      user: { select: { id: true, name: true, initials: true, image: true } },
      project: { select: { id: true, title: true, code: true } },
    },
    orderBy: { createdAt: "desc" },
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : hasPage ? { skip: (page - 1) * limit } : {}),
    take: limit + 1,
  });

  const hasMore = activities.length > limit;
  const items = hasMore ? activities.slice(0, limit) : activities;

  if (!hasPage) {
    return Response.json({
      activities: items,
      hasMore,
      nextCursor: hasMore ? items.at(-1)?.id ?? null : null,
    });
  }

  const total = await prisma.activity.count({ where });

  return Response.json({
    activities: items,
    total,
    pages: Math.ceil(total / limit),
    hasMore,
    nextCursor: hasMore ? items.at(-1)?.id ?? null : null,
  });
}
