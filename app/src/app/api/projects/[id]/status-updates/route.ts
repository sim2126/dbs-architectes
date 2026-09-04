/**
 * GET  /api/projects/[id]/status-updates  — list (most-recent first).
 * POST /api/projects/[id]/status-updates  — post a new status check-in.
 *
 * Distinct from the project's chat thread: these are structured PM
 * pulse entries (health + summary + next + blockers) that drive the
 * Status section on the project detail page and the upcoming PM
 * dashboard rollups.
 */

import { NextRequest } from "next/server";
import { prisma } from "@/platform/db";
import {
  loadProjectForAuth,
  PermissionError,
  permissionResponse,
  requirePermission,
} from "@/platform/authz";
import { notifyStatusPosted } from "@/features/notifications/server/producers";

const VALID_HEALTH = ["on_track", "at_risk", "off_track"] as const;
type Health = (typeof VALID_HEALTH)[number];

function isHealth(s: unknown): s is Health {
  return typeof s === "string" && (VALID_HEALTH as readonly string[]).includes(s);
}

function trimOrNull(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

const SUMMARY_MAX = 4000;
const FIELD_MAX = 2000;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    const { resource } = await requirePermission(request, "project:read", {
      loadResource: (s) => loadProjectForAuth(id, s.userId),
      context: { route: `GET /api/projects/${id}/status-updates` },
    });
    if (!resource) return Response.json({ error: "Not found" }, { status: 404 });
  } catch (e) {
    if (e instanceof PermissionError) return permissionResponse(e);
    throw e;
  }

  type Row = {
    id: string;
    health: string;
    summary: string;
    next: string | null;
    blockers: string | null;
    createdAt: Date;
    authorId: string;
    author: {
      id: string;
      name: string | null;
      email: string;
      initials: string | null;
      image: string | null;
    };
  };

  const rows = (await prisma.projectStatusUpdate.findMany({
    where: { projectId: id },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      health: true,
      summary: true,
      next: true,
      blockers: true,
      createdAt: true,
      authorId: true,
      author: {
        select: {
          id: true,
          name: true,
          email: true,
          initials: true,
          image: true,
        },
      },
    },
  })) as Row[];

  return Response.json(
    rows.map((r) => ({
      ...r,
      createdAt: r.createdAt.toISOString(),
    })),
  );
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  let actorUserId: string;
  try {
    const { resource, subject } = await requirePermission(request, "project:status.post", {
      loadResource: (s) => loadProjectForAuth(id, s.userId),
      context: { route: `POST /api/projects/${id}/status-updates` },
    });
    if (!resource) return Response.json({ error: "Not found" }, { status: 404 });
    actorUserId = subject.userId;
  } catch (e) {
    if (e instanceof PermissionError) return permissionResponse(e);
    throw e;
  }

  const body = (await request.json().catch(() => null)) as {
    health?: string;
    summary?: string;
    next?: string;
    blockers?: string;
  } | null;
  if (!body) {
    return Response.json({ error: "Body required" }, { status: 400 });
  }
  if (!isHealth(body.health)) {
    return Response.json(
      { error: "health must be one of: on_track, at_risk, off_track" },
      { status: 400 },
    );
  }
  const summary = trimOrNull(body.summary);
  if (!summary) {
    return Response.json({ error: "summary is required" }, { status: 400 });
  }
  if (summary.length > SUMMARY_MAX) {
    return Response.json(
      { error: `summary too long (max ${SUMMARY_MAX} chars)` },
      { status: 400 },
    );
  }
  const next = trimOrNull(body.next);
  const blockers = trimOrNull(body.blockers);
  if (next && next.length > FIELD_MAX) {
    return Response.json({ error: `next too long (max ${FIELD_MAX} chars)` }, { status: 400 });
  }
  if (blockers && blockers.length > FIELD_MAX) {
    return Response.json({ error: `blockers too long (max ${FIELD_MAX} chars)` }, { status: 400 });
  }

  const created = await prisma.projectStatusUpdate.create({
    data: {
      projectId: id,
      authorId: actorUserId,
      health: body.health,
      summary,
      next,
      blockers,
    },
    select: {
      id: true,
      health: true,
      summary: true,
      next: true,
      blockers: true,
      createdAt: true,
      authorId: true,
      author: {
        select: {
          id: true,
          name: true,
          email: true,
          initials: true,
          image: true,
        },
      },
    },
  });

  await prisma.activity.create({
    data: {
      type: "status",
      description: `Status update — ${body.health.replace("_", " ")}`,
      projectId: id,
      userId: actorUserId,
    },
  });

  // Tell the project team. The update and its activity entry are saved; a
  // notification problem must not turn that into a 500 the client retries.
  try {
    await notifyStatusPosted({
      projectId: id,
      statusUpdateId: created.id,
      actorId: actorUserId,
      health: body.health,
      summary,
    });
  } catch (error) {
    console.warn("[status-updates] notifications failed", error);
  }

  type CreatedRow = {
    id: string;
    health: string;
    summary: string;
    next: string | null;
    blockers: string | null;
    createdAt: Date;
    authorId: string;
    author: {
      id: string;
      name: string | null;
      email: string;
      initials: string | null;
      image: string | null;
    };
  };
  const row = created as CreatedRow;
  return Response.json({
    ...row,
    createdAt: row.createdAt.toISOString(),
  });
}
