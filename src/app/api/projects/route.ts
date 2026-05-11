import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PermissionError, permissionResponse, requirePermission } from "@/lib/authz";

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

  const { searchParams } = new URL(request.url);
  const search  = searchParams.get("search")  || "";
  const phase   = searchParams.get("phase")   || "";
  const category = searchParams.get("category") || "";
  const country = searchParams.get("country") || "";
  const operatingRegion = searchParams.get("region") || "";
  const cursor = searchParams.get("cursor") || "";
  const includePaging = searchParams.get("paging") === "1";
  const limit = boundedLimit(searchParams.get("limit"));

  const projects = await prisma.project.findMany({
    where: {
      AND: [
        search
          ? {
              OR: [
                { title:   { contains: search, mode: "insensitive" } },
                { code:    { contains: search, mode: "insensitive" } },
                { client:  { contains: search, mode: "insensitive" } },
                { commune: { contains: search, mode: "insensitive" } },
              ],
            }
          : {},
        phase           ? { phase }                     : {},
        category        ? { category }                  : {},
        country         ? { country }                   : {},
        operatingRegion ? { operatingRegion }           : {},
      ],
    },
    orderBy: { updatedAt: "desc" },
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    take: limit + 1,
    include: {
      assignments: {
        include: { user: { select: { id: true, name: true, initials: true } } },
      },
    },
  });

  const hasMore = projects.length > limit;
  const page = hasMore ? projects.slice(0, limit) : projects;

  if (includePaging) {
    return Response.json({
      projects: page,
      hasMore,
      nextCursor: hasMore ? page.at(-1)?.id ?? null : null,
    });
  }

  return Response.json(page);
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

  const project = await prisma.project.create({
    data: {
      code:            body.code,
      title:           body.title,
      category:        body.category        || "Residenziale",
      phase:           body.phase           || "ETUDE / AP",
      client:          body.client          || null,
      year:            body.year            ? parseInt(body.year) : null,
      commune:         body.commune         || null,
      typology:        body.typology        || null,
      terrain:         body.terrain         || null,
      roof:            body.roof            || null,
      description:     body.description     || null,
      pageLink:        body.pageLink        || null,
      image:           body.image           || null,
      country:         body.country         || null,
      operatingRegion: body.operatingRegion || null,
      regionCode:      body.regionCode      || null,
      address:         body.address         || null,
      latitude:        body.latitude        != null ? parseFloat(body.latitude) : null,
      longitude:       body.longitude       != null ? parseFloat(body.longitude) : null,
    },
    include: {
      assignments: {
        include: { user: { select: { id: true, name: true, initials: true } } },
      },
    },
  });

  await prisma.activity.create({
    data: {
      type: "created",
      description: `Progetto "${project.title}" creato`,
      projectId: project.id,
      userId: subjectUserId,
    },
  });

  return Response.json(project, { status: 201 });
}
