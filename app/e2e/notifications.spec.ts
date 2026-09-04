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
});
