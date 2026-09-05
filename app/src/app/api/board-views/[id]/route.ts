/**
 * DELETE /api/board-views/[id] — forget one of this person's saved views.
 *
 * Scoped to the owner by the query itself: an id belonging to someone else
 * matches nothing and reads as not found, which is also the correct answer.
 */

import { NextRequest } from "next/server";
import { auth } from "@/platform/auth";
import { deleteSavedView } from "@/features/board-views/server/saved-board-views";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const removed = await deleteSavedView(session.user.id, id);
  if (!removed) return Response.json({ error: "Not found" }, { status: 404 });

  return Response.json({ ok: true });
}
