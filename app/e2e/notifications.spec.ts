import { test, expect, type BrowserContext } from "@playwright/test";
import { expectAccessible } from "./a11y";
import { stateFor } from "./roles";

/**
 * Notifications: something happens, the right people are told, the bell
 * shows it, opening it marks it read. Exercised through the real API and the
 * real header, the way a DBS user meets it.
 *
 * Each test writes a marker into the record it creates so it can find its
 * own notification regardless of what else the seed or earlier runs left.
 */

type Project = { id: string; code: string };
type Notification = {
  id: string;
  type: string;
  category: string;
  title: string;
  body: string | null;
  href: string | null;
  projectCode: string | null;
};
type Page = { notifications: Notification[]; unreadCount: number };

async function inbox(ctx: BrowserContext): Promise<Page> {
  const res = await ctx.request.get("/api/notifications");
  expect(res.ok(), await res.text()).toBeTruthy();
  return res.json();
}

async function me(ctx: BrowserContext): Promise<{ id: string; name: string }> {
  const session = await (await ctx.request.get("/api/auth/session")).json();
  return session.user;
}

/**
 * A project the employee is assigned to, not merely allowed to see. Recipients
 * of a status update are the project's assignments, so visibility alone would
 * not earn them a notification.
 */
async function assignedProject(employee: BrowserContext): Promise<Project> {
  const { id: employeeId } = await me(employee);
  const visible = (await (await employee.request.get("/api/projects?limit=100")).json()) as Project[];
  for (const project of visible) {
    const detail = await (await employee.request.get(`/api/projects/${project.id}`)).json();
    const assigned = (detail.assignments ?? []) as { user: { id: string } }[];
    if (assigned.some((a) => a.user.id === employeeId)) return project;
  }
  throw new Error("the demo seed assigns employee@ to no project it can see");
}

/**
 * Post a status update as the admin. Admin is region-free, so the post is
 * accepted on any project; the PM demo account is scoped to one country and
 * is refused on the others, which is the region rule doing its job.
 */
async function postStatus(actor: BrowserContext, project: Project, summary: string) {
  const res = await actor.request.post(`/api/projects/${project.id}/status-updates`, {
    data: { health: "on_track", summary },
  });
  expect(res.ok(), await res.text()).toBeTruthy();
}

test.describe("notifications", () => {
  let pm: BrowserContext;
  let admin: BrowserContext;
  let employee: BrowserContext;

  test.beforeEach(async ({ browser }) => {
    pm = await browser.newContext({ storageState: stateFor("pm") });
    admin = await browser.newContext({ storageState: stateFor("admin") });
    employee = await browser.newContext({ storageState: stateFor("employee") });
  });
  test.afterEach(async () => {
    await Promise.all([pm.close(), admin.close(), employee.close()]);
  });

  test("a status update reaches the assigned team member's bell and is read by opening it", async () => {
    const project = await assignedProject(employee);
    const before = await inbox(employee);
    const marker = `E2E status check ${Date.now()}`;
    await postStatus(admin, project, marker);

    const after = await inbox(employee);
    const item = after.notifications.find((n) => n.body === marker);
    expect(item, "the assigned employee should have been told").toBeTruthy();
    expect(item!.type).toBe("status_posted");
    expect(item!.category).toBe("updates");
    expect(item!.projectCode).toBe(project.code);
    expect(after.unreadCount).toBe(before.unreadCount + 1);

    // The author is not told about their own update.
    const adminInbox = await inbox(admin);
    expect(adminInbox.notifications.find((n) => n.body === marker)).toBeUndefined();

    const page = await employee.newPage();
    await page.goto("/dashboard");
    const bell = page.getByRole("button", { name: /^notifications, \d+ unread$/i });
    await expect(bell).toBeVisible();
    await bell.click();

    const panel = page.getByRole("dialog", { name: "Notifications" });
    await expect(panel.getByText(marker)).toBeVisible();
    await expectAccessible(page, "notifications-panel");

    // Opening the row goes to the project and marks the row read.
    await panel.getByRole("link", { name: new RegExp(marker) }).click();
    await expect(page).toHaveURL(new RegExp(`/dashboard/projects\\?code=${project.code}`));
    await expect
      .poll(async () => (await inbox(employee)).unreadCount, { timeout: 10_000 })
      .toBe(before.unreadCount);
  });

  test("an @mention in a channel reaches the mentioned person under Mentions", async () => {
    const employeeUser = await me(employee);
    const raw = await (await pm.request.get("/api/chat/channels")).json();
    const channels = (Array.isArray(raw) ? raw : raw.channels) as { id: string; name: string }[];
    const general = channels.find((c) => c.name.toLowerCase() === "general");
    expect(general, "the seed has a #general channel").toBeTruthy();

    const marker = `E2E mention ${Date.now()}`;
    const posted = await pm.request.post("/api/chat/messages", {
      data: { channelId: general!.id, content: `@${employeeUser.name} ${marker}` },
    });
    expect(posted.ok(), await posted.text()).toBeTruthy();

    const list = await inbox(employee);
    const item = list.notifications.find((n) => n.body?.includes(marker));
    expect(item, "the mentioned employee should have been told").toBeTruthy();
    expect(item!.type).toBe("mentioned");
    expect(item!.category).toBe("mentions");
    expect(item!.href).toContain(general!.id);
  });

  test("the personal channel refuses anyone but its owner", async () => {
    const pmUser = await me(pm);
    const res = await employee.request.post("/api/chat/pusher/auth", {
      form: { socket_id: "1234.5678", channel_name: `private-user-${pmUser.id}` },
    });
    expect(res.status()).toBe(403);
  });

  test("WorkBook replies notify current assignees and disappear after their access is removed", async () => {
    const employeeUser = await me(employee);
    const adminUser = await me(admin);
    const created = await admin.request.post("/api/projects", {
      data: { title: `Notification access check ${Date.now()}`, country: "CH", phase: "ETUDE / AP" },
    });
    expect(created.ok(), await created.text()).toBeTruthy();
    const project = await created.json() as Project;
    try {
      for (const userId of [adminUser.id, employeeUser.id]) {
        const assigned = await admin.request.post(`/api/projects/${project.id}/members`, { data: { userId, role: "editor" } });
        expect(assigned.ok(), await assigned.text()).toBeTruthy();
      }
      const parentResponse = await employee.request.post(`/api/projects/${project.id}/thread`, { data: { content: "Please review this detail" } });
      expect(parentResponse.ok(), await parentResponse.text()).toBeTruthy();
      const parent = await parentResponse.json() as { id: string; channelId: string };
      const marker = `WorkBook reply ${Date.now()}`;
      const first = await admin.request.post(`/api/projects/${project.id}/thread`, {
        data: { content: marker, parentId: parent.id },
      });
      expect(first.ok(), await first.text()).toBeTruthy();
      expect((await inbox(employee)).notifications.some((item) => item.body === marker && item.type === "thread_reply")).toBe(true);
      const removed = await admin.request.delete(`/api/projects/${project.id}/members/${employeeUser.id}`);
      expect(removed.ok(), await removed.text()).toBeTruthy();
      expect((await inbox(employee)).notifications.some((item) => item.body === marker)).toBe(false);
      const later = `${marker} after removal`;
      const second = await admin.request.post("/api/chat/messages", {
        data: { channelId: parent.channelId, content: later, parentId: parent.id },
      });
      expect(second.ok(), await second.text()).toBeTruthy();
      expect((await inbox(employee)).notifications.some((item) => item.body === later)).toBe(false);
    } finally {
      const deleted = await admin.request.delete(`/api/projects/${project.id}`);
      expect(deleted.ok(), await deleted.text()).toBeTruthy();
    }
  });

  test("the bell pages through older notifications and recovers missed events on open", async () => {
    const page = await employee.newPage();
    let extra = false;
    let loads = 0;
    await page.route("**/api/notifications?**", async (route) => {
      loads++;
      const query = new URL(route.request().url()).searchParams;
      const start = query.has("cursor") ? 20 : 0;
      const category = query.get("category");
      const list = Array.from({ length: 25 }, (_, index) => ({
        id: `notification-${index}`, type: index < 20 ? "status_posted" : "mentioned",
        category: index < 20 ? "updates" : "mentions", title: `Notification ${index}`,
        body: `Notification body ${index}`, href: "/dashboard/projects", projectCode: null,
        actor: null, createdAt: new Date().toISOString(), readAt: null,
      }));
      const current = extra
        ? [{ ...list[20], id: "missed", title: "Recovered notification" }, ...list]
        : list;
      const filtered = category ? current.filter((item) => item.category === category) : current;
      await route.fulfill({ json: {
        notifications: filtered.slice(start, start + 20),
        unreadCount: extra ? 26 : 25, unreadByCategory: { mentions: extra ? 6 : 5, updates: 20 },
        hasMore: !category && !start, nextCursor: !category && !start ? "1750000000000:n1" : null,
      } });
    });
    await page.goto("/dashboard");
    await expect(page.getByRole("button", { name: "Notifications, 25 unread" })).toBeVisible();
    await page.getByRole("button", { name: "Notifications, 25 unread" }).click();
    const panel = page.getByRole("dialog", { name: "Notifications" });
    await expect(panel.getByRole("tab", { name: "Mentions 5" })).toBeVisible();
    await panel.getByRole("button", { name: "Load more notifications" }).click();
    await expect(panel.getByText("Notification body 24", { exact: true })).toBeVisible();
    await panel.getByRole("tab", { name: "Mentions 5" }).click();
    await expect(panel.getByText("Notification body 24", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Notifications, 25 unread" }).click();
    extra = true;
    const before = loads;
    await page.getByRole("button", { name: "Notifications, 25 unread" }).click();
    await expect(panel.getByText("Recovered notification")).toBeVisible();
    expect(loads).toBeGreaterThan(before);
  });

  test("HTTP read failures preserve unread state and display a retryable error", async () => {
    const page = await employee.newPage();
    await page.route("**/api/notifications**", async (route) => {
      if (route.request().method() === "PATCH") {
        await route.fulfill({ status: 500, json: { error: "Provider unavailable" } });
        return;
      }
      await route.fulfill({ json: {
        notifications: [{ id: "unread", type: "mentioned", category: "mentions", title: "Read failure check",
          body: "The unread state must remain", href: "/dashboard/projects", projectCode: null,
          actor: null, createdAt: new Date().toISOString(), readAt: null }],
        unreadCount: 1, unreadByCategory: { mentions: 1, updates: 0 }, hasMore: false, nextCursor: null,
      } });
    });
    await page.goto("/dashboard");
    await page.getByRole("button", { name: "Notifications, 1 unread" }).click();
    const panel = page.getByRole("dialog", { name: "Notifications" });
    await panel.getByRole("link", { name: /Read failure check/ }).click();
    await expect(panel.getByRole("alert")).toContainText("could not be marked as read");
    await expect(page.getByRole("button", { name: "Notifications, 1 unread" })).toBeVisible();
    await expect(page).toHaveURL(/\/dashboard$/);
    await panel.getByRole("button", { name: /mark.*read/i }).click();
    await expect(panel.getByRole("alert")).toContainText("could not be marked as read");
    await expect(page.getByRole("button", { name: "Notifications, 1 unread" })).toBeVisible();
  });
});
