import assert from "node:assert/strict";
import test from "node:test";
import { paginateNotifications, parseNotificationCursor } from "./pagination";

const rows = Array.from({ length: 45 }, (_, index) => ({
  id: `n${String(100 - index).padStart(3, "0")}`,
  type: index < 25 ? "status_posted" : "mentioned",
  readAt: index === 0 ? new Date() : null,
  createdAt: new Date("2026-09-05T09:00:00.000Z"),
}));

test("all pages remain accessible and category counts include rows beyond the first twenty", () => {
  const first = paginateNotifications(rows, { limit: 20 });
  assert.deepEqual(first.unreadByCategory, { updates: 24, mentions: 20 });
  assert.equal(first.unreadCount, 44);
  const second = paginateNotifications(rows, { limit: 20, cursor: parseNotificationCursor(first.nextCursor!) });
  const third = paginateNotifications(rows, { limit: 20, cursor: parseNotificationCursor(second.nextCursor!) });
  assert.deepEqual([...first.page, ...second.page, ...third.page], rows);
  assert.equal(third.hasMore, false);
  assert.equal(third.nextCursor, null);
  const mentions = paginateNotifications(rows, { limit: 20, category: "mentions" });
  assert.equal(mentions.page.length, 20);
  assert.equal(mentions.page[0].type, "mentioned");
  assert.equal(mentions.unreadCount, 44);
});

test("deleted or newly revoked cursor rows do not restart pagination", () => {
  const first = paginateNotifications(rows, { limit: 20 });
  const remaining = rows.filter((row) => row.id !== first.page.at(-1)!.id);
  const second = paginateNotifications(remaining, { limit: 20, cursor: parseNotificationCursor(first.nextCursor!) });
  assert.equal(second.page[0].id, rows[20].id);
  for (const value of ["", "missing", "nan:n1", "999999999999999999999:n1", "123:", "123:n:1"]) {
    assert.equal(parseNotificationCursor(value), null);
  }
});
