import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/platform/auth";
import { prisma } from "@/platform/db";

// GET /api/sheets — list all custom sheets for the current user
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sheets = await prisma.sheet.findMany({
    where: { userId: session.user.id },
    orderBy: { updatedAt: "desc" },
    select: { id: true, name: true, createdAt: true, updatedAt: true },
  });

  return NextResponse.json(sheets);
}

// POST /api/sheets — create a new custom sheet
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name, columns, rows } = await req.json() as {
    name: string;
    columns: string[];
    rows: Record<string, string>[];
  };

  const sheet = await prisma.sheet.create({
    data: {
      name: name.slice(0, 100),
      columns: JSON.stringify(columns ?? []),
      rows: JSON.stringify(rows ?? []),
      userId: session.user.id,
    },
  });

  return NextResponse.json(sheet);
}
