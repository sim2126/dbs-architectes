/**
 * GET /api/team-workload — JSON snapshot of every active workspace
 * member's current load. Mirrors the payload that powers the
 * /dashboard/team-workload page so external surfaces (the dashboard
 * widget, any future integration) consume one canonical shape.
 *
 * Gated by team:workload.read — same audience as the page. Optional
 * `?limit=N` returns the top N most-loaded members.
 */

import { NextRequest } from "next/server";
import { requirePermission, PermissionError, permissionResponse } from "@/platform/authz";
import { loadTeamWorkload } from "@/features/team-workload/server/load-team-workload";

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 500;

export async function GET(request: NextRequest) {
  try {
    const { subject } = await requirePermission(request, "team:workload.read", {
      context: { route: "GET /api/team-workload" },
    });

  const url = new URL(request.url);
  const limitParam = url.searchParams.get("limit");
  let limit = DEFAULT_LIMIT;
  if (limitParam) {
    const parsed = Number.parseInt(limitParam, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      limit = Math.min(parsed, MAX_LIMIT);
    }
  }

  const data = await loadTeamWorkload(subject);
  return Response.json({
    generatedAt: data.generatedAt,
    members: data.members.slice(0, limit),
  });
  } catch (error) {
    if (error instanceof PermissionError) return permissionResponse(error);
    throw error;
  }
}
