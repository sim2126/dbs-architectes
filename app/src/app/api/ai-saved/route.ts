import { NextRequest } from "next/server";
import { prisma } from "@/platform/db";
import { requireAiAccess } from "@/platform/ai/access";
import type { Block } from "@/features/ai/server/agent/blocks";
import type { Prisma } from "@prisma/client";

// GET /api/ai-saved — list user's saved insights, pinned-first
export async function GET(request: NextRequest) {
  const access = await requireAiAccess(request);
  if (!access.allowed) return access.response;

  const items = await prisma.savedAiResponse.findMany({
    where: { userId: access.subject.userId },
    orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
    take: 200,
  });

  return Response.json(items);
}

// POST /api/ai-saved — save a new snippet
//   body: { sessionId?, messageId?, title?, text, blocks }
export async function POST(request: NextRequest) {
  const access = await requireAiAccess(request);
  if (!access.allowed) return access.response;

  const body = (await request.json()) as {
    sessionId?: string;
    messageId?: string;
    title?: string;
    text?: string;
    blocks?: Block[];
  };

  if (!body.text && (!body.blocks || body.blocks.length === 0)) {
    return Response.json({ error: "Empty content" }, { status: 400 });
  }

  // Derive a default title from the first prose block or first text line.
  let title = body.title?.slice(0, 200);
  if (!title) {
    const firstProse = body.blocks?.find((b) => b.type === "prose");
    const candidate =
      (firstProse && firstProse.type === "prose" ? firstProse.text : body.text ?? "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 80);
    title = candidate || "Saved insight";
  }

  const saved = await prisma.savedAiResponse.create({
    data: {
      userId: access.subject.userId,
      sessionId: body.sessionId ?? null,
      messageId: body.messageId ?? null,
      title,
      text: body.text ?? "",
      blocks: (body.blocks ?? []) as unknown as Prisma.InputJsonValue,
    },
  });

  return Response.json(saved);
}
