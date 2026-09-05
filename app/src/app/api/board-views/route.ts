/**
 * GET  /api/board-views?board=projects — this person's saved views.
 * POST /api/board-views                — save one: { board, name, state }.
 *
 * A saved view is personal and holds no project data — only which filters
 * and columns someone likes — so being signed in is the whole gate. Guests
 * are refused by auth() as everywhere else.
 */

import { NextRequest } from "next/server";
import { auth } from "@/platform/auth";
import {
  listSavedViews,
  saveView,
} from "@/features/board-views/server/saved-board-views";

/** The only board today. Named so a second one is a deliberate addition. */
const BOARDS = new Set(["projects"]);

function boardFrom(value: string | null): string | null {
  return value && BOARDS.has(value) ? value : null;
}

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const board = boardFrom(searchParams.get("board"));
  if (!board) return Response.json({ error: "Unknown board" }, { status: 400 });

  const views = await listSavedViews(
    session.user.id,
    board,
    searchParams.get("groupBy") ?? "phase",
  );
  return Response.json({ views });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as {
    board?: unknown;
    name?: unknown;
    state?: unknown;
    groupBy?: unknown;
  } | null;
  if (!body) return Response.json({ error: "Body required" }, { status: 400 });

  const board = boardFrom(typeof body.board === "string" ? body.board : null);
  if (!board) return Response.json({ error: "Unknown board" }, { status: 400 });
  if (typeof body.name !== "string") {
    return Response.json({ error: "A view needs a name" }, { status: 400 });
  }

  const result = await saveView({
    userId: session.user.id,
    board,
    name: body.name,
    state: body.state,
    fallbackGroupBy: typeof body.groupBy === "string" ? body.groupBy : "phase",
  });
  if (!result.ok) return Response.json({ error: result.error }, { status: result.status });

  return Response.json(result.view, { status: 201 });
}
