import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

// GET /api/ai-chats — list NON-EMPTY sessions for the current user.
// Sessions with zero messages are skipped so abandoned "New chat" rows
// never appear in the sidebar. Combined with lazy session creation on
// the client (sessions only get inserted when the first message is
// actually sent) this keeps the history list clean and meaningful.
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sessions = await prisma.aiChatSession.findMany({
    where: {
      userId: session.user.id,
      messages: { some: {} },
    },
    orderBy: { updatedAt: "desc" },
    select: { id: true, title: true, createdAt: true, updatedAt: true },
  });

  return NextResponse.json(sessions);
}

// POST /api/ai-chats — create a new session
export async function POST() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const chatSession = await prisma.aiChatSession.create({
    data: { userId: session.user.id, title: "New chat" },
    select: { id: true, title: true, createdAt: true, updatedAt: true },
  });

  return NextResponse.json(chatSession);
}
