import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

// POST /api/sheets/sync-projects
// Body: { updates: { id: string; phase?: string; workStatus?: string; billing?: string; notes?: string }[] }
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const canEdit =
    (session.user as { role?: string }).role === "super_admin" ||
    (session.user as { role?: string }).role === "admin" ||
    (session.user as { role?: string }).role === "project_manager";

  if (!canEdit) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { updates } = await req.json() as {
    updates: {
      id: string;
      phase?: string;
      workStatus?: string;
      billing?: string;
      notes?: string;
    }[];
  };

  if (!Array.isArray(updates) || updates.length === 0) {
    return NextResponse.json({ error: "No updates provided" }, { status: 400 });
  }

  const results = await Promise.allSettled(
    updates.map(({ id, ...data }) =>
      prisma.project.update({
        where: { id },
        data: {
          ...(data.phase !== undefined ? { phase: data.phase } : {}),
          ...(data.workStatus !== undefined ? { workStatus: data.workStatus } : {}),
          ...(data.billing !== undefined ? { billing: data.billing } : {}),
          ...(data.notes !== undefined ? { notes: data.notes } : {}),
        },
      })
    )
  );

  const succeeded = results.filter((r) => r.status === "fulfilled").length;
  const failed = results.filter((r) => r.status === "rejected").length;

  return NextResponse.json({ ok: true, succeeded, failed });
}
