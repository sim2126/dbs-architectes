import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isManagerOrAbove } from "@/lib/permissions";

function boundedLimit(value: string | null, fallback = 100, max = 500) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.floor(parsed), max);
}

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
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  if (!isManagerOrAbove(session.user.role)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
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
      userId: session.user.id,
    },
  });

  return Response.json(project, { status: 201 });
}
