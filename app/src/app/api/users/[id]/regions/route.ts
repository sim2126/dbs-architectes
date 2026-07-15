import { NextRequest } from "next/server";
import { auth } from "@/platform/auth";
import { prisma } from "@/platform/db";
import { isAdmin } from "@/platform/authz/permissions";
import { pendoTrack } from "@/platform/integrations/pendo";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(session.user.role)) return Response.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const access = await prisma.userRegionAccess.findMany({ where: { userId: id } });
  return Response.json(access);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(session.user.role)) return Response.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  // Replace the full region access list for the user
  const { regions } = await request.json() as {
    regions: { country: string; operatingRegion?: string | null; accessLevel: "view" | "manage" }[];
  };

  await prisma.userRegionAccess.deleteMany({ where: { userId: id } });

  if (regions && regions.length > 0) {
    await prisma.userRegionAccess.createMany({
      data: regions.map((r) => ({
        userId: id,
        country: r.country,
        operatingRegion: r.operatingRegion ?? null,
        accessLevel: r.accessLevel,
      })),
    });
  }

  const countries = regions
    ? [...new Set(regions.map((r: { country: string }) => r.country))]
    : [];
  const accessLevels = regions
    ? [...new Set(regions.map((r: { accessLevel: string }) => r.accessLevel))]
    : [];
  pendoTrack("user_region_access_updated", {
    visitorId: session.user.id,
    properties: {
      targetUserId: id,
      regionCount: regions?.length ?? 0,
      countries: countries.join(","),
      accessLevels: accessLevels.join(","),
    },
  });

  const access = await prisma.userRegionAccess.findMany({ where: { userId: id } });
  return Response.json(access);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(session.user.role)) return Response.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const { country, operatingRegion, accessLevel } = await request.json();

  const access = await prisma.userRegionAccess.upsert({
    where: { userId_country_operatingRegion: { userId: id, country, operatingRegion: operatingRegion ?? null } },
    update: { accessLevel },
    create: { userId: id, country, operatingRegion: operatingRegion ?? null, accessLevel },
  });

  return Response.json(access, { status: 201 });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(session.user.role)) return Response.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const country = searchParams.get("country");
  const operatingRegion = searchParams.get("region") ?? null;

  if (!country) return Response.json({ error: "country is required" }, { status: 400 });

  await prisma.userRegionAccess.deleteMany({
    where: { userId: id, country, operatingRegion },
  });

  return Response.json({ success: true });
}
