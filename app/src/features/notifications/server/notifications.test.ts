import assert from "node:assert/strict";
import { afterEach, before, mock, test } from "node:test";
import type { Prisma, PrismaClient } from "@prisma/client";
import type { Subject } from "@/platform/authz";

const unexpected = async () => { throw new Error("Unexpected database call in unit test"); };
const prisma = {
  user: { findMany: unexpected }, project: { findMany: unexpected }, channel: { findMany: unexpected },
  notificationPreference: { findMany: unexpected },
  notification: { findMany: unexpected, createManyAndReturn: unexpected, updateMany: unexpected },
} as unknown as PrismaClient;
let listNotifications: typeof import("./list-notifications").listNotifications;
let markNotificationsRead: typeof import("./list-notifications").markNotificationsRead;
before(async () => {
  (globalThis as unknown as { prisma: PrismaClient }).prisma = prisma;
  ({ listNotifications, markNotificationsRead } = await import("./list-notifications"));
});

afterEach(() => mock.restoreAll());
const subject: Subject = { userId: "current", role: "employee", isExternal: false, regions: [
  { country: "CH", accessLevel: "view" },
] };

test("delivery filters stale memberships and live denies before storing or publishing excerpts", async () => {
  const before = { appId: process.env.PUSHER_APP_ID, key: process.env.PUSHER_KEY, secret: process.env.PUSHER_SECRET, cluster: process.env.PUSHER_CLUSTER };
  process.env.PUSHER_APP_ID = "notification-test";
  process.env.PUSHER_KEY = "notification-test";
  process.env.PUSHER_SECRET = "notification-test";
  process.env.PUSHER_CLUSTER = "eu";
  try {
    const { notify } = await import("./notify");
    const { pusherServer } = await import("@/platform/integrations/pusher");
    mock.method(prisma.notificationPreference, "findMany", async () => []);
    const users = mock.method(prisma.user, "findMany", async (args: Prisma.UserFindManyArgs) => {
      assert.equal(args.where?.isActive, true);
      assert.deepEqual(args.where?.employmentStatus, { notIn: ["suspended", "terminated"] });
      return ["current", "former", "denied"].map((id) => ({
        id, role: "employee", isExternal: false, regionAccess: [{ country: "CH", accessLevel: "view" }],
        permissionGrants: id === "denied" ? [{ action: "project:read", effect: "deny" }] : [],
      }));
    });
    const channels = mock.method(prisma.channel, "findMany", async () => [{
      id: "c1", type: "project", projectId: "p1", members: ["current", "former", "denied"].map((userId) => ({ userId })),
    }]);
    const projects = mock.method(prisma.project, "findMany", async () => [{
      id: "p1", country: "CH", operatingRegion: "Valais", assignments: ["current", "denied"].map((userId) => ({ userId, role: "editor" })),
    }]);
    mock.method(prisma.notification, "createManyAndReturn", async (args: { data: Prisma.NotificationCreateManyInput[] }) => {
      assert.deepEqual(args.data.map((row) => row.userId), ["current"]);
      return [{ id: "n1", userId: "current" }];
    });
    const pushes: unknown[] = [];
    mock.method(pusherServer, "triggerBatch", async (events: unknown) => { pushes.push(events); return {}; });
    const input = { recipients: ["current", "former", "denied", "inactive"], actorId: "author",
      type: "thread_reply" as const, title: "Private reply title", body: "Private excerpt", projectId: "p1", href: "/dashboard/chat?channel=c1" };
    assert.equal(await notify(input), 1);
    assert.deepEqual(pushes, [[{ channel: "private-user-current", name: "notification", data: { id: "n1" } }]]);
    assert.equal(users.mock.callCount(), 1);
    assert.equal(channels.mock.callCount(), 1);
    assert.equal(projects.mock.callCount(), 1);
    mock.method(pusherServer, "triggerBatch", async () => { throw new Error("offline"); });
    mock.method(console, "warn", () => {});
    assert.equal(await notify(input), 1, "saved notifications survive an unavailable realtime provider");
  } finally {
    for (const [key, value] of Object.entries({ PUSHER_APP_ID: before.appId, PUSHER_KEY: before.key, PUSHER_SECRET: before.secret, PUSHER_CLUSTER: before.cluster })) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});

test("inbox fetches bodies and counts only for sources still readable by the caller", async () => {
  const date = new Date("2026-09-05T09:00:00Z");
  mock.method(prisma.notification, "findMany", async (args: Prisma.NotificationFindManyArgs) => {
    assert.equal(args.where?.userId, subject.userId);
    if (!args.select?.title) return [
      { id: "status", type: "status_posted", readAt: null, createdAt: date, projectId: "p1", href: "/dashboard/projects?code=P1" },
      { id: "revoked-thread", type: "thread_reply", readAt: null, createdAt: date, projectId: "p1", href: "/dashboard/chat?channel=c1" },
      { id: "other-country", type: "status_posted", readAt: null, createdAt: date, projectId: "p2", href: "/dashboard/projects?code=P2" },
    ];
    assert.deepEqual(args.where?.id, { in: ["status"] });
    return [{ id: "status", type: "status_posted", readAt: null, createdAt: date, title: "Readable status",
      body: "Allowed excerpt", href: "/dashboard/projects?code=P1", project: { code: "P1" }, actor: null }];
  });
  mock.method(prisma.channel, "findMany", async () => [{ id: "c1", type: "project", projectId: "p1", members: [{ userId: "current" }] }]);
  mock.method(prisma.project, "findMany", async () => [
    { id: "p1", country: "CH", operatingRegion: "Valais", assignments: [] },
    { id: "p2", country: "IT", operatingRegion: "Lombardia", assignments: [] },
  ]);
  const page = await listNotifications(subject);
  assert.deepEqual(page.notifications.map((row) => row.id), ["status"]);
  assert.equal(page.unreadCount, 1);
  assert.deepEqual(page.unreadByCategory, { updates: 1, mentions: 0 });
  assert.equal(page.hasMore, false);
});

test("read-write failures remain failures instead of claiming unread state changed", async () => {
  mock.method(prisma.notification, "updateMany", async () => { throw new Error("database unavailable"); });
  await assert.rejects(markNotificationsRead(subject, { all: true }), /database unavailable/);
});
