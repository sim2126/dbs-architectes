import { NextRequest } from "next/server";
import { prisma } from "@/platform/db";
import { requireAiAccess } from "@/platform/ai/access";

// PATCH /api/ai-saved/[id] — rename or toggle pinned
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const access = await requireAiAccess(request);
  if (!access.allowed) return access.response;

  const { id } = await params;
  const body = (await request.json()) as { title?: string; pinned?: boolean };

  const result = await prisma.savedAiResponse.updateMany({
    where: { id, userId: access.subject.userId },
    data: {
      ...(typeof body.title === "string" ? { title: body.title.slice(0, 200) } : {}),
      ...(typeof body.pinned === "boolean" ? { pinned: body.pinned } : {}),
    },
  });

  if (result.count === 0) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  return Response.json({ ok: true });
}

// DELETE /api/ai-saved/[id]
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const access = await requireAiAccess(request);
  if (!access.allowed) return access.response;

  const { id } = await params;
  await prisma.savedAiResponse.deleteMany({
    where: { id, userId: access.subject.userId },
  });

  return Response.json({ ok: true });
}
