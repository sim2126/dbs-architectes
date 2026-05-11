import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

// Self-service endpoint: the signed-in user can read and update a tight
// allowlist of their own profile fields. Anything that touches identity
// (email), authorization (role, can*), or organizational structure
// (departmentId, managerId, isActive) goes through /api/users/[id] and
// is admin-gated.
const SELF_EDITABLE = ["name", "phone", "defaultCountry", "image"] as const;

export async function GET() {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      image: true,
      role: true,
      initials: true,
      defaultCountry: true,
      defaultRegion: true,
    },
  });
  if (!user) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json(user);
}

export async function PATCH(request: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json()) as Record<string, unknown>;
  const update: Record<string, unknown> = {};

  for (const k of SELF_EDITABLE) {
    if (body[k] === undefined) continue;
    const v = body[k];
    if (k === "defaultCountry") {
      update[k] = typeof v === "string" && v.length > 0 ? v : null;
    } else if (k === "image") {
      update[k] = typeof v === "string" ? v : null;
    } else if (typeof v === "string") {
      update[k] = v.trim() || null;
    }
  }

  if (Object.keys(update).length === 0) {
    return Response.json({ error: "No editable fields supplied" }, { status: 400 });
  }

  // Keep initials in sync when the user changes their name
  const nameUpdate = update["name"];
  if (typeof nameUpdate === "string" && nameUpdate.length > 0) {
    update["initials"] = nameUpdate
      .split(/\s+/)
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
  }

  const user = await prisma.user.update({
    where: { id: session.user.id },
    data: update,
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      image: true,
      role: true,
      initials: true,
      defaultCountry: true,
      defaultRegion: true,
    },
  });
  return Response.json(user);
}

// Surface every key the client must NOT post here so a misconfigured form
// doesn't silently get dropped. Lets callers see the contract at a glance.
export async function OPTIONS() {
  return Response.json({
    editable: SELF_EDITABLE,
    note: "Identity, role, can*, isActive, departmentId, managerId go through /api/users/[id] (admin-only).",
  });
}
