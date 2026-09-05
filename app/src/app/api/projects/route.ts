import { NextRequest } from "next/server";
import { auth } from "@/platform/auth";
import {
  loadSubject,
  PermissionError,
  permissionResponse,
  readableProjectCountries,
  requirePermission,
} from "@/platform/authz";
import { projectCapabilities } from "@/features/projects/domain/project-capabilities";
import { listProjects } from "@/features/projects/server/list-projects";
import { createProject } from "@/features/projects/server/create-project";
import { announceProjectChange } from "@/features/projects/server/announce-project-change";

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
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  // auth() above already refuses guests; loadSubject() adds the regions and
  // grants the visibility rule needs. Both, deliberately: widening this to
  // loadSubject alone would hand the project list to conversation guests.
  const subject = await loadSubject();

  const { searchParams } = new URL(request.url);
  const result = await listProjects({
    search:          searchParams.get("search")  ?? undefined,
    phase:           searchParams.get("phase")   ?? undefined,
    category:        searchParams.get("category") ?? undefined,
    country:         searchParams.get("country") ?? undefined,
    operatingRegion: searchParams.get("region")  ?? undefined,
    cursor:          searchParams.get("cursor")  ?? undefined,
    limit:           boundedLimit(searchParams.get("limit")),
    visibleCountries: subject ? readableProjectCountries(subject) : [],
  });

  // Each row says what this caller may do to it, so a board can grey the
  // cells it must not offer without keeping its own copy of the rules.
  // authorize() is pure and the assignment is already loaded, so this costs
  // nothing beyond the subject already loaded above.
  const projects = subject
    ? result.projects.map((project) => ({
        ...project,
        capabilities: projectCapabilities(subject, project),
      }))
    : result.projects;

  if (searchParams.get("paging") === "1") {
    return Response.json({ ...result, projects });
  }
  return Response.json(projects);
}

export async function POST(request: NextRequest) {
  let subjectUserId: string;
  try {
    const { subject } = await requirePermission(request, "project:create", {
      context: { route: "POST /api/projects" },
    });
    subjectUserId = subject.userId;
  } catch (e) {
    if (e instanceof PermissionError) return permissionResponse(e);
    throw e;
  }

  const body = await request.json();
  const project = await createProject({ actorUserId: subjectUserId, data: body });
  await announceProjectChange(project.id);
  return Response.json(project, { status: 201 });
}
