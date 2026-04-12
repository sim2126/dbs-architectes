import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

// GET /api/ai-chats/[id] — get messages for a session
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const chatSession = await prisma.aiChatSession.findFirst({
    where: { id, userId: session.user.id },
    include: {
      messages: { orderBy: { createdAt: "asc" } },
    },
  });

  if (!chatSession) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(chatSession);
}

// PATCH /api/ai-chats/[id] — update session title
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { title } = await req.json() as { title: string };

  const chatSession = await prisma.aiChatSession.updateMany({
    where: { id, userId: session.user.id },
    data: { title: title.slice(0, 100) },
  });

  if (chatSession.count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ ok: true });
}

// DELETE /api/ai-chats/[id] — delete a session
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  await prisma.aiChatSession.deleteMany({ where: { id, userId: session.user.id } });

  return NextResponse.json({ ok: true });
}

// POST /api/ai-chats/[id] — append messages + optionally update title
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { userContent, assistantContent, title } = await req.json() as {
    userContent: string;
    assistantContent: string;
    title?: string;
  };

  // Verify ownership
  const chatSession = await prisma.aiChatSession.findFirst({
    where: { id, userId: session.user.id },
  });
  if (!chatSession) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.$transaction([
    prisma.aiChatMessage.create({ data: { sessionId: id, role: "user", content: userContent } }),
    prisma.aiChatMessage.create({ data: { sessionId: id, role: "assistant", content: assistantContent } }),
    prisma.aiChatSession.update({
      where: { id },
      data: { updatedAt: new Date(), ...(title ? { title } : {}) },
    }),
  ]);

  return NextResponse.json({ ok: true });
}
