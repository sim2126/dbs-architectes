import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/platform/db";
import { requireAiAccess } from "@/platform/ai/access";
import { parseStoredAssistantMessage } from "@/features/ai/server/agent/artifacts";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const access = await requireAiAccess(_req);
  if (!access.allowed) return access.response;
  const { id } = await params;
  const chatSession = await prisma.aiChatSession.findFirst({
    where: { id, userId: access.subject.userId },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });
  if (!chatSession) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({
    ...chatSession,
    messages: chatSession.messages.map((message) => {
      if (message.role !== "assistant") {
        return {
          id: message.id,
          role: message.role,
          content: message.content,
          artifacts: [],
          steps: [],
          blocks: [],
        };
      }
      const parsed = parseStoredAssistantMessage(message.content);
      return {
        id: message.id,
        role: message.role,
        content: parsed.text,
        artifacts: parsed.artifacts,
        steps: parsed.steps,
        blocks: parsed.blocks,
      };
    }),
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const access = await requireAiAccess(req);
  if (!access.allowed) return access.response;
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as { title?: unknown } | null;
  if (!body || typeof body.title !== "string" || !body.title.trim()) {
    return NextResponse.json({ error: "A title is required." }, { status: 400 });
  }
  const updated = await prisma.aiChatSession.updateMany({
    where: { id, userId: access.subject.userId },
    data: { title: body.title.trim().slice(0, 100) },
  });
  if (updated.count === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const access = await requireAiAccess(_req);
  if (!access.allowed) return access.response;
  const { id } = await params;
  const deleted = await prisma.aiChatSession.deleteMany({
    where: { id, userId: access.subject.userId },
  });
  if (deleted.count === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
