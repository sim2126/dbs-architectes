import { NextRequest } from "next/server";
import { auth } from "@/platform/auth";
import { prisma } from "@/platform/db";

// PATCH /api/ai-saved/[id] — rename or toggle pinned
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = (await request.json()) as { title?: string; pinned?: boolean };

  const result = await prisma.savedAiResponse.updateMany({
    where: { id, userId: session.user.id },
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
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  await prisma.savedAiResponse.deleteMany({
    where: { id, userId: session.user.id },
  });

  return Response.json({ ok: true });
}
