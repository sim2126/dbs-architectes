import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/platform/auth";
import { prisma } from "@/platform/db";
import { toProjectSyncData, type ProjectSyncUpdate } from "@/features/sheets";

// POST /api/sheets/sync-projects
// Body: { updates: ProjectSyncUpdate[] }
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const canEdit =
    (session.user as { role?: string }).role === "super_admin" ||
    (session.user as { role?: string }).role === "admin" ||
    (session.user as { role?: string }).role === "project_manager";

  if (!canEdit) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { updates } = await req.json() as { updates: ProjectSyncUpdate[] };

  if (!Array.isArray(updates) || updates.length === 0) {
    return NextResponse.json({ error: "No updates provided" }, { status: 400 });
  }

  const results = await Promise.allSettled(
    updates.map((update) =>
      prisma.project.update({
        where: { id: update.id },
        data: toProjectSyncData(update),
      })
    )
  );

  const succeeded = results.filter((r) => r.status === "fulfilled").length;
  const failed = results.filter((r) => r.status === "rejected").length;

  return NextResponse.json({ ok: true, succeeded, failed });
}
