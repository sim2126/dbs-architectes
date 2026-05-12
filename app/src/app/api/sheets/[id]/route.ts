import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/platform/auth";
import { prisma } from "@/platform/db";

// GET /api/sheets/[id] — get full sheet data
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const sheet = await prisma.sheet.findFirst({ where: { id, userId: session.user.id } });
  if (!sheet) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    ...sheet,
    columns: JSON.parse(sheet.columns),
    rows: JSON.parse(sheet.rows),
  });
}

// PUT /api/sheets/[id] — update sheet name / columns / rows
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { name, columns, rows } = await req.json() as {
    name?: string;
    columns?: string[];
    rows?: Record<string, string>[];
  };

  const updated = await prisma.sheet.updateMany({
    where: { id, userId: session.user.id },
    data: {
      ...(name !== undefined ? { name: name.slice(0, 100) } : {}),
      ...(columns !== undefined ? { columns: JSON.stringify(columns) } : {}),
      ...(rows !== undefined ? { rows: JSON.stringify(rows) } : {}),
    },
  });

  if (updated.count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

// DELETE /api/sheets/[id]
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  await prisma.sheet.deleteMany({ where: { id, userId: session.user.id } });
  return NextResponse.json({ ok: true });
}
