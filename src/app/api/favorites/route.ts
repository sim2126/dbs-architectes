import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

// Polymorphic favourites — any project, sheet, agenda item, AI chat
// session, or team member can be starred per-user.

const VALID_ENTITY_TYPES = new Set([
  "project",
  "sheet",
  "agenda",
  "user",
  "ai_chat",
]);

// GET /api/favorites
//   ?type=project   → only that entity type (optional)
//   ?expand=1       → include resolved entity summaries for the sidebar
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const typeFilter = searchParams.get("type") || undefined;
  const expand = searchParams.get("expand") === "1";

  const favorites = await prisma.favorite.findMany({
    where: {
      userId: session.user.id,
      ...(typeFilter ? { entityType: typeFilter } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  if (!expand) return Response.json(favorites);

  // Fan-out lookup per entity type so the sidebar can render rich rows
  // without N+1 calls from the client.
  const byType = new Map<string, string[]>();
  for (const f of favorites) {
    const ids = byType.get(f.entityType) ?? [];
    ids.push(f.entityId);
    byType.set(f.entityType, ids);
  }

  const [projects, sheets, agenda, users, aiChats] = await Promise.all([
    byType.get("project")
      ? prisma.project.findMany({
          where: { id: { in: byType.get("project")! } },
          select: { id: true, code: true, title: true, phase: true, workStatus: true },
        })
      : Promise.resolve([]),
    byType.get("sheet")
      ? prisma.sheet.findMany({
          where: { id: { in: byType.get("sheet")! } },
          select: { id: true, name: true, updatedAt: true },
        })
      : Promise.resolve([]),
    byType.get("agenda")
      ? prisma.agendaItem.findMany({
          where: { id: { in: byType.get("agenda")! } },
          select: { id: true, title: true, date: true, priority: true, status: true },
        })
      : Promise.resolve([]),
    byType.get("user")
      ? prisma.user.findMany({
          where: { id: { in: byType.get("user")! } },
          select: { id: true, name: true, initials: true, role: true },
        })
      : Promise.resolve([]),
    byType.get("ai_chat")
      ? prisma.aiChatSession.findMany({
          where: { id: { in: byType.get("ai_chat")! } },
          select: { id: true, title: true, updatedAt: true },
        })
      : Promise.resolve([]),
  ]);

  return Response.json({
    favorites,
    entities: { projects, sheets, agenda, users, aiChats },
  });
}

// POST /api/favorites — toggle (idempotent: creates if missing, no-ops if exists)
//   body: { entityType, entityId }
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as { entityType?: string; entityId?: string };
  if (!body.entityType || !body.entityId) {
    return Response.json({ error: "entityType and entityId are required" }, { status: 400 });
  }
  if (!VALID_ENTITY_TYPES.has(body.entityType)) {
    return Response.json({ error: "Unknown entityType" }, { status: 400 });
  }

  const fav = await prisma.favorite.upsert({
    where: {
      userId_entityType_entityId: {
        userId: session.user.id,
        entityType: body.entityType,
        entityId: body.entityId,
      },
    },
    update: {},
    create: {
      userId: session.user.id,
      entityType: body.entityType,
      entityId: body.entityId,
    },
  });

  return Response.json(fav);
}

// DELETE /api/favorites?entityType=project&entityId=...
export async function DELETE(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const entityType = searchParams.get("entityType");
  const entityId = searchParams.get("entityId");
  if (!entityType || !entityId) {
    return Response.json({ error: "entityType and entityId are required" }, { status: 400 });
  }

  await prisma.favorite.deleteMany({
    where: {
      userId: session.user.id,
      entityType,
      entityId,
    },
  });

  return Response.json({ ok: true });
}
