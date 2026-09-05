/**
 * Saved board views — one person's named arrangements of a board.
 *
 * The state is opaque here: it is the board's UI shape, stored as JSON so
 * that adding a column kind does not need a migration. It is validated on
 * the way out (ui/board/saved-views) rather than trusted, and every query is
 * scoped to one user, because a view is personal.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/platform/db";
import { normaliseViewName, parseSavedViewState, type SavedView } from "@/ui/board";

/** A person cannot accumulate more than this many views on one board. */
export const MAX_VIEWS_PER_BOARD = 40;

export async function listSavedViews(
  userId: string,
  board: string,
  fallbackGroupBy: string,
): Promise<SavedView[]> {
  const rows = await prisma.savedBoardView.findMany({
    where: { userId, board },
    orderBy: { name: "asc" },
    select: { id: true, name: true, state: true },
  });

  // A row that no longer parses is dropped rather than thrown: one bad view
  // must not take the board's whole menu down with it.
  return rows.flatMap((row) => {
    const state = parseSavedViewState(row.state, fallbackGroupBy);
    if (!state) {
      console.warn(`[board-views] ignoring unreadable view ${row.id}`);
      return [];
    }
    return [{ id: row.id, name: row.name, state }];
  });
}

export type SaveViewResult =
  | { ok: true; view: SavedView }
  | { ok: false; error: string; status: 400 | 409 };

export async function saveView(args: {
  userId: string;
  board: string;
  name: string;
  state: unknown;
  fallbackGroupBy: string;
}): Promise<SaveViewResult> {
  const name = normaliseViewName(args.name);
  if (!name) return { ok: false, error: "A view needs a name", status: 400 };

  const state = parseSavedViewState(args.state, args.fallbackGroupBy);
  if (!state) return { ok: false, error: "That is not a board view", status: 400 };

  const existing = await prisma.savedBoardView.count({
    where: { userId: args.userId, board: args.board },
  });
  const replacing = await prisma.savedBoardView.findUnique({
    where: { userId_board_name: { userId: args.userId, board: args.board, name } },
    select: { id: true },
  });
  if (!replacing && existing >= MAX_VIEWS_PER_BOARD) {
    return {
      ok: false,
      error: `You already have ${MAX_VIEWS_PER_BOARD} saved views on this board`,
      status: 409,
    };
  }

  // Saving under a name you already used replaces it, which is what the
  // word "save" means everywhere else.
  const row = await prisma.savedBoardView.upsert({
    where: { userId_board_name: { userId: args.userId, board: args.board, name } },
    create: {
      userId: args.userId,
      board: args.board,
      name,
      state: state as unknown as Prisma.InputJsonValue,
    },
    update: { state: state as unknown as Prisma.InputJsonValue },
    select: { id: true, name: true },
  });

  return { ok: true, view: { id: row.id, name: row.name, state } };
}

/** Scoped to the owner: an id belonging to someone else simply does not match. */
export async function deleteSavedView(userId: string, id: string): Promise<boolean> {
  const { count } = await prisma.savedBoardView.deleteMany({ where: { id, userId } });
  return count > 0;
}
