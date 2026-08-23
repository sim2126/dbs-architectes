import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/platform/db";
import { requireAiAccess } from "@/platform/ai/access";

// GET /api/ai-chats — list NON-EMPTY sessions for the current user.
// Sessions with zero messages are skipped so abandoned "New chat" rows
// never appear in the sidebar. Combined with lazy session creation on
// the client (sessions only get inserted when the first message is
// actually sent) this keeps the history list clean and meaningful.
export async function GET(request: NextRequest) {
  const access = await requireAiAccess(request);
  if (!access.allowed) return access.response;

  const sessions = await prisma.aiChatSession.findMany({
    where: {
      userId: access.subject.userId,
      messages: { some: {} },
    },
    orderBy: { updatedAt: "desc" },
    select: { id: true, title: true, createdAt: true, updatedAt: true },
  });

  return NextResponse.json(sessions);
}

// POST /api/ai-chats — create a new session
export async function POST(request: NextRequest) {
  const access = await requireAiAccess(request);
  if (!access.allowed) return access.response;

  const chatSession = await prisma.aiChatSession.create({
    data: { userId: access.subject.userId, title: "New chat" },
    select: { id: true, title: true, createdAt: true, updatedAt: true },
  });

  return NextResponse.json(chatSession);
}
