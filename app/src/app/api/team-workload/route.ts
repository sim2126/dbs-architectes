/**
 * GET /api/team-workload — JSON snapshot of every active workspace
 * member's current load. Mirrors the payload that powers the
 * /dashboard/team-workload page so external surfaces (the dashboard
 * widget, any future integration) consume one canonical shape.
 *
 * Gated by isManagerOrAbove — same audience as the page. Optional
 * `?limit=N` returns the top N most-loaded members.
 */

import { NextRequest } from "next/server";
import { auth } from "@/platform/auth";
import { isManagerOrAbove } from "@/platform/authz/permissions";
import { loadTeamWorkload } from "@/features/team-workload/server/load-team-workload";

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 500;

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isManagerOrAbove(session.user.role)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const limitParam = url.searchParams.get("limit");
  let limit = DEFAULT_LIMIT;
  if (limitParam) {
    const parsed = Number.parseInt(limitParam, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      limit = Math.min(parsed, MAX_LIMIT);
    }
  }

  const data = await loadTeamWorkload();
  return Response.json({
    generatedAt: data.generatedAt,
    members: data.members.slice(0, limit),
  });
}
