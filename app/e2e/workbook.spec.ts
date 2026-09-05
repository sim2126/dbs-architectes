import { test, expect, type Page } from "@playwright/test";
import { expectAccessible } from "./a11y";
import { stateFor } from "./roles";

/**
 * WorkBook — the projects board.
 *
 * The board is where the studio is meant to spend its day, so these journeys
 * check the behaviours that make it usable rather than only that it renders:
 * groups, editing a cell in place, the change surviving a reload, bulk
 * actions, adding a project, and the conversation panel.
 *
 * Every edit is made against real rows on the staging database and put back
 * afterwards, so the suite can run repeatedly.
 */

type Project = {
  id: string;
  code: string;
  title: string;
  phase: string;
  workStatus: string;
  client: string | null;
  /** What this caller may do to the row, as the server computed it. */
  capabilities?: { read: boolean; update: boolean; updateStatus: boolean; assign: boolean };
};

const STATUS_LABEL: Record<string, string> = {
  todo: "Not Started",
  doing: "Working on it",
  stuck: "Stuck",
  completed: "Done",
};

async function projects(page: Page): Promise<Project[]> {
  const res = await page.request.get("/api/projects?limit=500");
  expect(res.ok(), await res.text()).toBeTruthy();
  return res.json();
}

async function board(page: Page) {
  await page.goto("/dashboard/sheets");
  // The board owns its toolbar, so its search box is the signal it mounted.
  await expect(page.getByLabel("Search the board")).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Item" })).toBeVisible();
}

test.describe("workbook board", () => {
  test.use({ storageState: stateFor("admin") });

  test("projects are grouped by phase, with counts and a status distribution", async ({ page }) => {
    const rows = await projects(page);
    await board(page);

    // Every phase is a group header, including one with no projects: Monday
    // shows the empty group so work can be moved into it.
    // Exact, because the phase cells carry the same words in their labels.
    const header = page.getByRole("button", { name: "Study / Prelim.", exact: true });
    await expect(header).toBeVisible();
    await expect(header).toHaveAttribute("aria-expanded", "true");

    const inStudy = rows.filter((r) => r.phase === "ETUDE/AP").length;
    await expect(page.getByText(`${inStudy} projects`, { exact: true }).first()).toBeVisible();

    // The group footer's distribution is announced for readers who cannot
    // see the bar.
    await expect(page.getByText(/Status: (Not Started|Working on it|Stuck|Done) \d+/).first()).toBeVisible();

    await expectAccessible(page, "workbook-board");
  });

  test("a status cell picks from the palette and the change is saved at once", async ({ page }) => {
    const before = (await projects(page)).find((p) => p.workStatus !== "stuck");
    expect(before, "a project not already stuck").toBeTruthy();
    const target = before!;

    await board(page);
    const cell = page.getByRole("button", { name: new RegExp(`^Status of ${escapeRe(target.title)}:`) });
    await cell.scrollIntoViewIfNeeded();
    await cell.click();

    const palette = page.getByRole("menu", { name: "Set Status" });
    await expect(palette).toBeVisible();
    await palette.getByRole("menuitem", { name: STATUS_LABEL.stuck }).click();

    // No Save button anywhere: the write has already happened.
    await expect(page.getByRole("button", { name: /^Sync to DB/ })).toHaveCount(0);
    await expect
      .poll(async () => (await projects(page)).find((p) => p.id === target.id)?.workStatus)
      .toBe("stuck");

    // And it is still there after a reload, not only in the tab that made it.
    await page.reload();
    await expect(
      page.getByRole("button", { name: new RegExp(`^Status of ${escapeRe(target.title)}: ${STATUS_LABEL.stuck}`) }),
    ).toBeVisible();

    await page.request.patch(`/api/projects/${target.id}`, {
      data: { workStatus: target.workStatus },
    });
  });

  test("a text cell edits in place, commits on Enter and reverts on Escape", async ({ page }) => {
    const target = (await projects(page))[0];
    await board(page);

    const cellName = new RegExp(`^Client of ${escapeRe(target.title)}:`);
    const marker = `E2E client ${Date.now()}`;

    await page.getByRole("button", { name: cellName }).first().click();
    const editor = page.getByLabel(`Client of ${target.title}`);
    await expect(editor).toBeFocused();
    await editor.fill(marker);
    await editor.press("Enter");
    await expect
      .poll(async () => (await projects(page)).find((p) => p.id === target.id)?.client)
      .toBe(marker);

    // Escape abandons the edit rather than saving it.
    await page.getByRole("button", { name: cellName }).first().click();
    const second = page.getByLabel(`Client of ${target.title}`);
    await second.fill("discarded");
    await second.press("Escape");
    await expect(page.getByRole("button", { name: new RegExp(`Client of ${escapeRe(target.title)}: ${marker}`) })).toBeVisible();
    expect((await projects(page)).find((p) => p.id === target.id)?.client).toBe(marker);

    await page.request.patch(`/api/projects/${target.id}`, {
      data: { client: target.client },
    });
  });

  test("selecting rows raises one bulk bar that moves them together", async ({ page }) => {
    const rows = await projects(page);
    const targets = rows.filter((r) => r.phase !== "STUCK").slice(0, 2);
    expect(targets.length).toBe(2);

    await board(page);
    for (const target of targets) {
      await page.getByLabel(`Select ${target.title}`).first().check({ force: true });
    }

    const bar = page.getByRole("region", { name: /2 projects selected/ });
    await expect(bar).toBeVisible();

    await bar.getByRole("button", { name: "Set status" }).click();
    await bar.getByRole("menuitem", { name: STATUS_LABEL.completed }).click();

    await expect
      .poll(async () => {
        const now = await projects(page);
        return targets.every((t) => now.find((p) => p.id === t.id)?.workStatus === "completed");
      })
      .toBe(true);

    for (const target of targets) {
      await page.request.patch(`/api/projects/${target.id}`, {
        data: { workStatus: target.workStatus },
      });
    }
  });

  test("adding a project needs only a name; the code is allocated", async ({ page }) => {
    await board(page);
    const title = `E2E board item ${Date.now()}`;

    const add = page.getByLabel(/^Add project to Construction$/);
    await add.scrollIntoViewIfNeeded();
    await add.fill(title);
    await add.press("Enter");

    await expect
      .poll(async () => (await projects(page)).find((p) => p.title === title)?.code)
      .toMatch(/^DBS-\d{4}-\d{3,}$/);

    const created = (await projects(page)).find((p) => p.title === title)!;
    expect(created.phase, "it lands in the group it was typed into").toBe("CHANTIER");

    await page.request.delete(`/api/projects/${created.id}`);
  });

  test("a change made elsewhere appears without reloading", async ({ page, browser }) => {
    // The board is shared: several people have it open at once. This is the
    // behaviour that stops one of them overwriting a change they cannot see.
    const target = (await projects(page)).find((p) => p.workStatus !== "stuck")!;
    await board(page);
    const cell = page.getByRole("button", { name: new RegExp(`^Status of ${escapeRe(target.title)}:`) });
    await cell.scrollIntoViewIfNeeded();
    await expect(cell).toBeVisible();

    // Wait until the board says it is live. Between mount and subscription
    // Pusher delivers nothing, so changing the row before then proves only
    // that the event was dropped.
    //
    // Where there is no broker configured — CI runs without Pusher
    // credentials — there is nothing to assert, so the test says so and
    // stops rather than reporting a failure it cannot avoid.
    const live = await page
      .getByLabel("Live updates on")
      .waitFor({ timeout: 20_000 })
      .then(() => true)
      .catch(() => false);
    test.skip(!live, "no real-time broker is configured in this environment");

    // A second person, in their own browser, moves it.
    const other = await browser.newContext({ storageState: stateFor("pm") });
    const res = await other.request.patch(`/api/projects/${target.id}`, {
      data: { workStatus: "stuck" },
    });
    expect(res.ok(), await res.text()).toBeTruthy();
    await other.close();

    // The first person's board catches up on its own.
    await expect(
      page.getByRole("button", { name: new RegExp(`^Status of ${escapeRe(target.title)}: ${STATUS_LABEL.stuck}`) }),
    ).toBeVisible({ timeout: 15_000 });

    await page.request.patch(`/api/projects/${target.id}`, {
      data: { workStatus: target.workStatus },
    });
  });

  test("filter, sort and hide change the view without touching the data", async ({ page }) => {
    const rows = await projects(page);
    const doing = rows.filter((p) => p.workStatus === "doing").length;
    expect(doing, "the seed has projects in progress").toBeGreaterThan(0);
    expect(doing).toBeLessThan(rows.length);

    await board(page);
    await expect(page.getByText(`${rows.length} of ${rows.length} projects shown`)).toBeVisible();

    // Filter: only what is being worked on.
    await page.getByRole("button", { name: /^Filter/ }).click();
    const filterMenu = page.getByRole("menu", { name: "Filter" });
    await expect(filterMenu).toBeVisible();
    await expectAccessible(page, "workbook-filter-menu");
    await filterMenu.getByRole("menuitemcheckbox", { name: STATUS_LABEL.doing }).click();
    await page.keyboard.press("Escape");
    await expect(page.getByText(`${doing} of ${rows.length} projects shown`)).toBeVisible();

    // Sort: by client, ascending, within each group.
    await page.getByRole("button", { name: /^Sort/ }).click();
    await page.getByRole("menu", { name: "Sort" }).getByRole("menuitem", { name: /^Sort by Client/ }).click();
    await page.keyboard.press("Escape");
    const clients = await page
      .locator('td button[aria-label^="Client of "]')
      .evaluateAll((els) =>
        els.map((el) => (el.getAttribute("aria-label") ?? "").split(": ").slice(1).join(": ")),
      );
    const named = clients.filter((c) => c && c !== "empty");
    const sorted = [...named].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
    // Sorting is within groups, so compare each group's run rather than the
    // whole column. The first group's names are the first run.
    expect(named.length).toBeGreaterThan(1);
    expect(sorted[0]).toBe(named[0]);

    // Hide: the column leaves the board.
    await page.getByRole("button", { name: /^Hide/ }).click();
    await page.getByRole("menu", { name: "Hide" }).getByRole("menuitemcheckbox", { name: "Notes" }).click();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("columnheader", { name: "Notes" })).toHaveCount(0);
    await expect(page.getByRole("columnheader", { name: "Client" })).toBeVisible();

    // None of it wrote anything.
    const after = await projects(page);
    expect(after.filter((p) => p.workStatus === "doing").length).toBe(doing);
  });

  test("the person filter shows only that person's projects", async ({ page }) => {
    const rows = await projects(page);
    const roster = (await (await page.request.get("/api/team")).json()) as {
      id: string;
      name: string | null;
    }[];
    const busiest = roster
      .map((person) => ({
        person,
        count: rows.filter((r) => (r as unknown as { assignments: { userId: string }[] }).assignments
          .some((a) => a.userId === person.id)).length,
      }))
      .filter((entry) => entry.count > 0 && entry.count < rows.length)
      .sort((a, b) => b.count - a.count)[0];
    expect(busiest, "someone is assigned to some but not all projects").toBeTruthy();

    await board(page);
    await page.getByRole("button", { name: /^Person/ }).click();
    const menu = page.getByRole("menu", { name: "Person" });
    await menu.getByRole("menuitemcheckbox", { name: new RegExp(escapeRe(busiest.person.name ?? "")) }).click();
    await page.keyboard.press("Escape");

    await expect(page.getByText(`${busiest.count} of ${rows.length} projects shown`)).toBeVisible();
  });

  test("kanban shows a column per phase and moves a project between them", async ({ page }) => {
    const rows = await projects(page);
    const target = rows.find((p) => p.phase === "ETUDE/AP");
    expect(target, "the seed has a project in the first phase").toBeTruthy();

    await board(page);
    await page.getByRole("button", { name: "Kanban view" }).click();

    // A column per phase, each announcing what it holds.
    const study = page.getByRole("region", { name: /^Study \/ Prelim\., \d+ projects?$/ });
    await expect(study).toBeVisible();
    await expect(page.getByRole("region", { name: /^Construction, \d+ projects?$/ })).toBeVisible();
    await expectAccessible(page, "workbook-kanban");

    // Dragging is the gesture, but the Move menu is the same call and is the
    // one a keyboard can reach — so that is what the test drives.
    const card = page.getByRole("button", { name: `Move ${target!.title} to another phase` });
    await card.scrollIntoViewIfNeeded();
    await card.click();
    await page.getByRole("menu", { name: `Move ${target!.title}` }).getByRole("menuitem", { name: "Construction" }).click();

    await expect
      .poll(async () => (await projects(page)).find((p) => p.id === target!.id)?.phase)
      .toBe("CHANTIER");
    await expect(
      page.getByRole("region", { name: /^Construction, \d+ projects?$/ })
        .getByText(target!.title),
    ).toBeVisible();

    await page.request.patch(`/api/projects/${target!.id}`, { data: { phase: target!.phase } });
  });

  test("a card can be dragged into another column", async ({ page }) => {
    const rows = await projects(page);
    const target = rows.find((p) => p.phase === "ETUDE/AP")!;

    await board(page);
    await page.getByRole("button", { name: "Kanban view" }).click();
    const card = page.locator("li[draggable='true']").filter({ hasText: target.title }).first();
    await expect(card).toBeVisible();

    const construction = page.getByRole("region", { name: /^Construction, \d+ projects?$/ });
    await card.dragTo(construction);

    await expect
      .poll(async () => (await projects(page)).find((p) => p.id === target.id)?.phase, { timeout: 10_000 })
      .toBe("CHANTIER");

    await page.request.patch(`/api/projects/${target.id}`, { data: { phase: target.phase } });
  });

  test("a row shows how much has been said about it", async ({ page }) => {
    await board(page);
    // Rows with a conversation carry the count in the button's own name, so
    // it is available to a screen reader and not only as a badge.
    const withUpdates = page.getByRole("button", { name: /^Updates on .+, \d+ so far$/ });
    await expect(withUpdates.first()).toBeVisible();
  });

  test("a row opens the panel where its conversation lives", async ({ page }) => {
    const target = (await projects(page))[0];
    await board(page);

    await page.getByRole("button", { name: new RegExp(`^Updates on ${escapeRe(target.title)}`) }).first().click();

    const panel = page.getByRole("dialog", { name: `${target.title} updates` });
    await expect(panel).toBeVisible();
    await expect(panel.getByText(target.code)).toBeVisible();
    await expect(panel.getByRole("link", { name: new RegExp(`Open the full page for`) })).toBeVisible();
    await expectAccessible(page, "workbook-item-panel");
  });
});

test.describe("workbook board, restricted role", () => {
  test.use({ storageState: stateFor("employee") });

  test("the board lists only projects this person may open", async ({ page, browser }) => {
    // A row the viewer cannot open should not be on the board at all: its
    // title, client and commune are not public within the practice, and the
    // list used to show all of them and reveal the boundary only on click.
    const mine = await projects(page);
    expect(mine.length).toBeGreaterThan(0);
    for (const project of mine) {
      expect(project.capabilities?.read, `${project.code} is listed but not readable`).not.toBe(false);
    }

    const admin = await browser.newContext({ storageState: stateFor("admin") });
    const all = (await (await admin.request.get("/api/projects?limit=500")).json()) as Project[];
    await admin.close();

    expect(all.length).toBeGreaterThan(mine.length);
    const hidden = all.filter((p) => !mine.some((m) => m.id === p.id));
    expect(hidden.length, "the employee is region-scoped, so something is withheld").toBeGreaterThan(0);

    // And the withheld ones really are refused, not merely absent.
    const refused = await page.request.get(`/api/projects/${hidden[0].id}`);
    expect(refused.status()).toBe(403);
  });

  test("an employee cannot type into a project they do not run", async ({ page }) => {
    const rows = await projects(page);
    // The row the server says is read-only for this caller. Every listed row
    // carries that answer, which is the point of computing it server-side.
    const readOnly = rows.find((p) => p.capabilities?.update === false);
    expect(readOnly, "the demo seed leaves an employee some project they do not edit").toBeTruthy();

    await board(page);
    const client = page
      .getByRole("button", { name: new RegExp(`^Client of ${escapeRe(readOnly!.title)}:`) })
      .first();
    await client.scrollIntoViewIfNeeded();
    await expect(client).toBeDisabled();

    // Status follows its own rule: offered only where policy allows it.
    const status = page
      .getByRole("button", { name: new RegExp(`^Status of ${escapeRe(readOnly!.title)}:`) })
      .first();
    if (readOnly!.capabilities?.updateStatus) await expect(status).toBeEnabled();
    else await expect(status).toBeDisabled();
  });
});

function escapeRe(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
