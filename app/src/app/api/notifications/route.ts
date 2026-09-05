/**
 * GET   /api/notifications            — the caller's notifications, newest first,
 *                                       with the unread count.
 * PATCH /api/notifications            — mark read: { ids: string[] } or { all: true }.
 *
 * Rows are scoped to the session user; there is nothing to authorise beyond
 * being signed in, and external users may be mentioned like anyone else.
 */

import { NextRequest } from "next/server";
import { loadSubject } from "@/platform/authz";
import {
  listNotifications,
  markNotificationsRead,
} from "@/features/notifications/server/list-notifications";
import { parseNotificationCursor } from "@/features/notifications/domain/pagination";

function boundedLimit(value: string | null, fallback = 20, max = 50) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.floor(parsed), max);
}

export async function GET(request: NextRequest) {
  const subject = await loadSubject();
  if (!subject) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const cursor = searchParams.get("cursor");
  if (cursor && !parseNotificationCursor(cursor)) {
    return Response.json({ error: "Invalid notification cursor" }, { status: 400 });
  }
  const category = searchParams.get("category");
  const page = await listNotifications(subject, {
    limit: boundedLimit(searchParams.get("limit")),
    cursor,
    ...(category === "mentions" || category === "updates" ? { category } : {}),
  });
  return Response.json(page);
}

export async function PATCH(request: NextRequest) {
  const subject = await loadSubject();
  if (!subject) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as
    | { ids?: unknown; all?: unknown }
    | null;
  if (!body) return Response.json({ error: "Body required" }, { status: 400 });

  if (body.all === true) {
    return Response.json(await markNotificationsRead(subject, { all: true }));
  }
  const ids = Array.isArray(body.ids)
    ? body.ids.filter((v): v is string => typeof v === "string").slice(0, 100)
    : [];
  if (ids.length === 0) {
    return Response.json({ error: "ids or all is required" }, { status: 400 });
  }
  return Response.json(await markNotificationsRead(subject, { ids }));
}
