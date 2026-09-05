import { NextRequest } from "next/server";
import {
  authorize,
  canRegionAccess,
  loadSubject,
  PermissionError,
  permissionResponse,
  requirePermission,
} from "@/platform/authz";
import { projectCapabilities } from "@/features/projects/domain/project-capabilities";
import { listProjects } from "@/features/projects/server/list-projects";
import { createProject } from "@/features/projects/server/create-project";
import { announceProjectChange } from "@/features/projects/server/announce-project-change";
import { ProjectInputError, requireProjectObject, validateProjectValues } from "@/features/projects/domain/project-input";

function boundedLimit(value: string | null, fallback = 100, max = 500) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.floor(parsed), max);
}

// List endpoints don't run authorize() — the contract there is "filter
// at query time by what the caller is allowed to see", not gate the
// whole list. Audit log stays for per-resource decisions; coarse access
// logging belongs to the proxy/CloudWatch layer.
export async function GET(request: NextRequest) {
  const subject = await loadSubject();
  if (!subject) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (subject.isExternal) return Response.json({ error: "Guest access is limited to invited conversations." }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const result = await listProjects({
    search:          searchParams.get("search")  ?? undefined,
    phase:           searchParams.get("phase")   ?? undefined,
    category:        searchParams.get("category") ?? undefined,
    country:         searchParams.get("country") ?? undefined,
    operatingRegion: searchParams.get("region")  ?? undefined,
    cursor:          searchParams.get("cursor")  ?? undefined,
    limit:           boundedLimit(searchParams.get("limit")),
    subject,
  });

  // Each row says what this caller may do to it, so a board can grey the
  // cells it must not offer without keeping its own copy of the rules.
  // authorize() is pure and the assignment is already loaded, so this costs
  // nothing beyond the subject already loaded above.
  const projects = result.projects.map((project) => ({
        ...project,
        capabilities: projectCapabilities(subject, project),
      }));

  if (searchParams.get("paging") === "1") {
    return Response.json({ ...result, projects });
  }
  return Response.json(projects);
}

export async function POST(request: NextRequest) {
  try {
    const { subject } = await requirePermission(request, "project:create", {
      context: { route: "POST /api/projects" },
    });
    const body = await request.json();
    requireProjectObject(body);
    validateProjectValues(body, true);
    const target = {
      kind: "project" as const,
      id: "__new__",
      country: (body.country as string | null | undefined) || null,
      operatingRegion: (body.operatingRegion as string | null | undefined) || null,
    };
    if (!authorize(subject, "project:read", target).allow || !canRegionAccess(subject, target, "manage")) {
      throw new PermissionError(403, "You don't have permission to create projects in this region.");
    }
    const project = await createProject({
      actorUserId: subject.userId,
      data: body as Parameters<typeof createProject>[0]["data"],
    });
    await announceProjectChange(project.id);
    return Response.json({ ...project, updateCount: 0, capabilities: projectCapabilities(subject, project) }, { status: 201 });
  } catch (e) {
    if (e instanceof PermissionError) return permissionResponse(e);
    if (e instanceof ProjectInputError) return Response.json({ error: e.message }, { status: e.status });
    if (e instanceof SyntaxError) return Response.json({ error: "Invalid JSON body." }, { status: 400 });
    throw e;
  }
}
