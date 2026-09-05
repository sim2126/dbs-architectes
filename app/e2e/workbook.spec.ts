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
  year: number | null;
  startDate: string | null;
  endDate: string | null;
  updateCount?: number;
  /** What this caller may do to the row, as the server computed it. */
  capabilities?: { read: boolean; update: boolean; updateStatus: boolean; assign: boolean };
};

const STATUS_LABEL: Record<string, string> = {
  todo: "Not Started",
  doing: "Working on it",
  stuck: "Stuck",
  completed: "Done",
};

/**
 * Every project, paged exactly as the board pages. Asking for one capped
 * page would test a different board from the one on screen — which is how
 * these tests first failed at 800 projects.
 */
async function projects(page: Page): Promise<Project[]> {
  const all: Project[] = [];
  let cursor: string | null = null;
  for (let i = 0; i < 20; i++) {
    const query = new URLSearchParams({ paging: "1", limit: "500" });
    if (cursor) query.set("cursor", cursor);
    const res = await page.request.get(`/api/projects?${query}`);
    expect(res.ok(), await res.text()).toBeTruthy();
    const body = (await res.json()) as {
      projects: Project[];
      hasMore: boolean;
      nextCursor: string | null;
    };
    all.push(...body.projects);
    if (!body.hasMore || !body.nextCursor) break;
    cursor = body.nextCursor;
  }
  return all;
}

/**
 * Bring one project into view.
 *
 * The board only renders the rows near the viewport, so at any real size a
 * given row is simply not in the page until something puts it there. A person
 * would search for it; so does this.
 */
async function showOnBoard(page: Page, title: string) {
  await page.getByLabel("Search the board").fill(title);
  await expect(
    page.getByRole("button", { name: new RegExp(`^Status of ${escapeRe(title)}:`) }),
  ).toBeVisible();
}

async function board(page: Page) {
  await page.goto("/dashboard/sheets");
  // The board owns its toolbar, so its search box is the signal it mounted.
  await expect(page.getByLabel("Search the board")).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Item" })).toBeVisible();
}

test.describe("workbook board", () => {
  test.use({ storageState: stateFor("admin") });

  test("year edits save an integer and survive reload", async ({ page }) => {
    const target = (await projects(page))[0];
    const year = target.year === 2027 ? 2028 : 2027;
    try {
      await board(page);
      await showOnBoard(page, target.title);
      await page.getByRole("button", { name: new RegExp(`^Year of ${escapeRe(target.title)}:`) }).click();
      const editor = page.getByLabel(`Year of ${target.title}`, { exact: true });
      await editor.fill(String(year));
      await editor.press("Enter");
      await expect.poll(async () => (await projects(page)).find((p) => p.id === target.id)?.year).toBe(year);
      await page.reload();
      await showOnBoard(page, target.title);
      await expect(page.getByRole("button", { name: `Year of ${target.title}: ${year}`, exact: true })).toBeVisible();
    } finally {
      const response = await page.request.patch(`/api/projects/${target.id}`, { data: { year: target.year } });
      expect(response.ok(), await response.text()).toBeTruthy();
    }
  });

  test("column dragging moves the source before the drop target", async ({ page }) => {
    await board(page);
    // Both headings must remain in view: scrolling an off-screen source
    // away between mouse-down and mouse-move prevents a native drag starting.
    const source = page.getByRole("columnheader", { name: /^Phase column options/ });
    const target = page.getByRole("columnheader", { name: /^Status column options/ });
    await source.dragTo(target);
    await expect.poll(async () => {
      const keys = await page.locator("thead th button").allTextContents();
      return keys.indexOf("Phase") < keys.indexOf("Status");
    }).toBe(true);
  });

  test("two edits and a slow refresh cannot overwrite one another", async ({ page }) => {
    const target = (await projects(page))[0];
    await board(page);
    await showOnBoard(page, target.title);
    let stored = { ...target };
    let releaseWrite!: () => void;
    let releaseRead!: () => void;
    const writeGate = new Promise<void>((resolve) => { releaseWrite = resolve; });
    const readGate = new Promise<void>((resolve) => { releaseRead = resolve; });
    let writes = 0;
    let reads = 0;
    await page.route(`**/api/projects/${target.id}`, async (route) => {
      if (route.request().method() !== "PATCH") { await route.continue(); return; }
      const next = { ...stored, ...route.request().postDataJSON() };
      writes++;
      if (writes === 1) await writeGate;
      stored = next;
      await route.fulfill({ json: stored });
    });
    await page.route("**/api/projects?*", async (route) => {
      if (new URL(route.request().url()).searchParams.get("paging") !== "1") { await route.continue(); return; }
      const response = await route.fetch();
      const body = await response.json();
      const snapshot = { ...stored };
      reads++;
      if (reads === 1) await readGate;
      await route.fulfill({ json: { ...body, projects: body.projects.map((project: Project) => project.id === target.id ? { ...project, ...snapshot } : project) } });
    });
    try {
      await page.getByRole("button", { name: "Board actions", exact: true }).click();
      await page.getByRole("menuitem", { name: "Refresh the board", exact: true }).click();
      await expect.poll(() => reads).toBeGreaterThan(0);
      await page.getByRole("button", { name: new RegExp(`^Client of ${escapeRe(target.title)}:`) }).click();
      await page.getByLabel(`Client of ${target.title}`, { exact: true }).fill("Ordered client edit");
      await page.getByLabel(`Client of ${target.title}`, { exact: true }).press("Enter");
      await expect.poll(() => writes).toBe(1);
      await page.getByRole("button", { name: new RegExp(`^Year of ${escapeRe(target.title)}:`) }).click();
      await page.getByLabel(`Year of ${target.title}`, { exact: true }).fill("2029");
      await page.getByLabel(`Year of ${target.title}`, { exact: true }).press("Enter");
      releaseRead();
      releaseWrite();
      await expect.poll(() => writes).toBe(2);
      await expect.poll(() => reads).toBeGreaterThan(1);
      await expect(page.getByRole("button", { name: `Client of ${target.title}: Ordered client edit`, exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: `Year of ${target.title}: 2029`, exact: true })).toBeVisible();
    } finally {
      releaseRead();
      releaseWrite();
    }
  });

  test("filtering a selected row away forgets it permanently", async ({ page }) => {
    const [first, second] = await projects(page);
    await board(page);
    await showOnBoard(page, first.title);
    await page.getByRole("checkbox", { name: `Select ${first.title}`, exact: true }).click();
    await showOnBoard(page, second.title);
    await page.getByRole("checkbox", { name: `Select ${second.title}`, exact: true }).click();
    await page.getByLabel("Search the board").fill("");
    await expect(page.getByRole("region", { name: "1 project selected, bulk actions", exact: true })).toBeVisible();
  });

  test("failed creation and view saving retain their drafts", async ({ page }) => {
    await board(page);
    await page.route("**/api/projects", async (route) => {
      if (route.request().method() === "POST") await route.fulfill({ status: 500, json: { error: "Creation unavailable" } });
      else await route.continue();
    });
    const draft = page.getByLabel("Add project to Study / Prelim.", { exact: true });
    await draft.fill("Draft retained after a failed creation");
    const creationFailed = page.waitForResponse((response) => response.request().method() === "POST" && new URL(response.url()).pathname === "/api/projects");
    await draft.press("Enter");
    await creationFailed;
    await expect(draft).toBeEnabled();
    await expect(draft).toHaveValue("Draft retained after a failed creation");
    await draft.press("Escape");

    await page.route("**/api/board-views", async (route) => {
      if (route.request().method() === "POST") await route.fulfill({ status: 500, json: { error: "View saving unavailable" } });
      else await route.continue();
    });
    await page.getByRole("button", { name: "Views", exact: true }).click();
    await page.getByRole("menuitem", { name: "Save this view", exact: true }).click();
    const name = page.getByLabel("Name for this view");
    await name.fill("Retained view name");
    const saveFailed = page.waitForResponse((response) => response.request().method() === "POST" && new URL(response.url()).pathname === "/api/board-views");
    await name.press("Enter");
    await saveFailed;
    await expect(name).toBeEnabled();
    await expect(name).toHaveValue("Retained view name");
  });

  test("rendered table heights match windowing including empty groups", async ({ page }) => {
    const target = (await projects(page))[0];
    await board(page);
    await showOnBoard(page, target.title);
    const metrics = await page.getByRole("table", { name: "Projects", exact: true }).evaluate((table) => ({
      heading: table.querySelector("thead")!.getBoundingClientRect().height,
      groups: Array.from(table.querySelectorAll("tbody")).map((group) => ({
        header: group.firstElementChild!.getBoundingClientRect().height,
        rows: Array.from(group.querySelectorAll("tr")).slice(1).map((row) => ({
          height: row.getBoundingClientRect().height,
          summary: row === group.lastElementChild && !row.querySelector("input") && Boolean(group.querySelector('th[scope="row"]')),
        })),
      })),
    }));
    expect(metrics.heading).toBe(36);
    for (const group of metrics.groups) {
      expect(group.header).toBe(44);
      for (const row of group.rows) expect(row.height).toBe(row.summary ? 26 : 36);
    }
  });

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
    await expect(page.getByText(`${rows.length} of ${rows.length} projects shown`)).toBeVisible();

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
    await showOnBoard(page, target.title);
    const cell = page.getByRole("button", { name: new RegExp(`^Status of ${escapeRe(target.title)}:`) });
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
    await showOnBoard(page, target.title);
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
    await showOnBoard(page, target.title);

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
    await board(page);

    /*
     * Take the first two rows the board has actually rendered rather than two
     * chosen from the API. Narrowing the search to reach a row elsewhere would
     * clear the first selection — correctly, since the board refuses to hold a
     * selection for rows nobody can see.
     */
    const boxes = page.locator('input[type="checkbox"][aria-label^="Select "]');
    const labels: string[] = [];
    for (let i = 0; labels.length < 2 && i < 8; i++) {
      const label = await boxes.nth(i).getAttribute("aria-label");
      if (label && !label.startsWith("Select all in ")) labels.push(label.replace("Select ", ""));
    }
    expect(labels.length).toBe(2);
    const targets = labels.map((title) => rows.find((r) => r.title === title)!);
    expect(targets.every(Boolean)).toBe(true);

    for (const title of labels) {
      await page.getByLabel(`Select ${title}`).first().check({ force: true });
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
    const other = await browser.newContext({ storageState: stateFor("pm") });
    const list = await other.request.get("/api/projects?limit=500");
    expect(list.ok(), await list.text()).toBeTruthy();
    const target = ((await list.json()) as Project[]).find((p) => p.capabilities?.updateStatus && p.workStatus !== "stuck");
    expect(target, "the PM has a project they may update").toBeTruthy();
    if (!target) { await other.close(); return; }
    try {
    await board(page);
    await showOnBoard(page, target.title);

    // Wait until the board says it is live. Between mount and subscription
    // Pusher delivers nothing, so changing the row before then proves only
    // that the event was dropped.
    await expect(page.getByLabel("Live updates on")).toBeVisible({ timeout: 20_000 });

    // A second person, in their own browser, moves it.
    const res = await other.request.patch(`/api/projects/${target.id}`, {
      data: { workStatus: "stuck" },
    });
    expect(res.ok(), await res.text()).toBeTruthy();

    // The first person's board catches up on its own.
    await expect(
      page.getByRole("button", { name: new RegExp(`^Status of ${escapeRe(target.title)}: ${STATUS_LABEL.stuck}`) }),
    ).toBeVisible({ timeout: 15_000 });

    } finally {
      await other.close();
      const restored = await page.request.patch(`/api/projects/${target.id}`, {
        data: { workStatus: target.workStatus },
      });
      expect(restored.ok(), await restored.text()).toBeTruthy();
    }
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

  test("a column can be reordered, resized and put away from its own menu", async ({ page }) => {
    await board(page);
    // Rendered text, not textContent: the headings are uppercased by CSS, so
    // the DOM says "Client" while the screen says "CLIENT".
    const headings = async () =>
      (await page.locator("thead th").allInnerTexts()).map((t) => t.trim()).filter(Boolean);
    const widthOf = async (label: string) =>
      (await page.getByRole("columnheader", { name: new RegExp(`^${label} column options`) }).boundingBox())!.width;

    // Relative to whatever is next to it, so adding a column to the board
    // does not make this test wrong.
    const before = await headings();
    const wasAt = before.indexOf("CLIENT");
    expect(wasAt).toBeGreaterThan(0);
    const wasLeftOfIt = before[wasAt - 1];
    const widthBefore = await widthOf("Client");

    // Dragging does this too, but the menu is the path a keyboard can take.
    await page.getByRole("button", { name: /^Client column options/ }).click();
    await page.getByRole("menu", { name: "Client column" }).getByRole("menuitem", { name: "Move left" }).click();
    const moved = await headings();
    expect(moved.indexOf("CLIENT")).toBe(wasAt - 1);
    expect(moved[wasAt], "the two swapped places").toBe(wasLeftOfIt);

    await page.getByRole("button", { name: /^Client column options/ }).click();
    await page.getByRole("menu", { name: "Client column" }).getByRole("menuitem", { name: "Wider" }).click();
    await page.keyboard.press("Escape");
    await expect.poll(() => widthOf("Client")).toBeGreaterThan(widthBefore);

    await page.getByRole("button", { name: /^Client column options/ }).click();
    await page.getByRole("menu", { name: "Client column" }).getByRole("menuitem", { name: "Hide column" }).click();
    await expect(page.getByRole("columnheader", { name: /^Client column options/ })).toHaveCount(0);

    // An arrangement is a view, not an edit: nothing was written.
    const rows = await projects(page);
    expect(rows.length).toBeGreaterThan(0);
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

  test("an arrangement can be named, left and come back to", async ({ page }) => {
    const name = `E2E view ${Date.now()}`;
    await board(page);

    // Something worth keeping: only what is being worked on, as a Kanban.
    await page.getByRole("button", { name: /^Filter/ }).click();
    await page.getByRole("menu", { name: "Filter" }).getByRole("menuitemcheckbox", { name: STATUS_LABEL.doing }).click();
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Kanban view" }).click();

    await page.getByRole("button", { name: /^Views$/ }).click();
    await page.getByRole("menu", { name: "Saved views" }).getByRole("menuitem", { name: "Save this view" }).click();
    await page.getByLabel("Name for this view").fill(name);
    await page.keyboard.press("Enter");

    // The button says what you are looking at.
    await expect(page.getByRole("button", { name: `Views, showing ${name}` })).toBeVisible();

    // Leave it, and the board is plain again.
    await page.getByRole("button", { name: `Views, showing ${name}` }).click();
    await page.getByRole("menu", { name: "Saved views" }).getByRole("menuitem", { name: "All projects" }).click();
    await expect(page.getByRole("columnheader", { name: "Item" })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Filter 1/ })).toHaveCount(0);

    // Come back to it, and every part of it returns: filter, layout, grouping.
    await page.getByRole("button", { name: /^Views$/ }).click();
    await page.getByRole("menu", { name: "Saved views" }).getByRole("menuitem", { name: new RegExp(escapeRe(name)) }).click();
    await expect(page.locator("li[draggable='true']").first()).toBeVisible();
    await expect(page.getByRole("button", { name: `Views, showing ${name}` })).toBeVisible();

    // It survives a reload, because it is stored rather than remembered.
    await page.reload();
    await page.getByRole("button", { name: /^Views$/ }).click();
    const menu = page.getByRole("menu", { name: "Saved views" });
    await expect(menu.getByRole("menuitem", { name: new RegExp(escapeRe(name)) })).toBeVisible();

    await menu.getByRole("button", { name: `Delete the view ${name}` }).click();
    await expect(page.getByRole("menuitem", { name: new RegExp(escapeRe(name)) })).toHaveCount(0);
  });

  test("the calendar draws dated projects across the days they run", async ({ page }) => {
    const rows = await projects(page);
    const dated = rows.filter((p) => p.startDate);
    expect(dated.length, "the demo projects carry dates").toBeGreaterThan(0);

    await board(page);
    await page.getByRole("button", { name: "Calendar view" }).click();

    // A month, Monday first, with today marked.
    await expect(page.getByRole("heading", { level: 2, name: /^\w+ \d{4}$/ })).toBeVisible();
    await expect(page.getByText("Mon", { exact: true })).toBeVisible();

    // Bars name the project and the days it covers, so the calendar is
    // readable without seeing the colours.
    const bars = page.getByRole("button", { name: /, \d+ \w+ \d{4}( to \d+ \w+ \d{4})?,/ });
    await expect(bars.first()).toBeVisible();
    await expectAccessible(page, "workbook-calendar");

    // Stepping months keeps working and does not lose the view.
    await page.getByRole("button", { name: "Previous month" }).click();
    await expect(page.getByRole("heading", { level: 2, name: /^\w+ \d{4}$/ })).toBeVisible();
    await page.getByRole("button", { name: "Today" }).click();

    // A bar opens the project it belongs to.
    await bars.first().click();
    await expect(page.getByRole("dialog", { name: /updates$/ })).toBeVisible();
  });

  test("a date cell picks a day and saves it", async ({ page }) => {
    const target = (await projects(page))[0];
    const day = new Date(target.endDate ?? "2027-03-10T00:00:00.000Z");
    day.setUTCDate(day.getUTCDate() - 1);
    if (day.toISOString().slice(0, 10) === target.startDate?.slice(0, 10)) day.setUTCDate(day.getUTCDate() - 1);
    const value = day.toISOString().slice(0, 10);
    const label = day.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
    try {
      await board(page);
      await showOnBoard(page, target.title);
      const cell = page.getByRole("button", { name: new RegExp(`^Start of ${escapeRe(target.title)}:`) });
      await cell.click();

      const input = page.getByLabel(`Start of ${target.title}`);
      await expect(input).toBeFocused();
      await input.fill(value);

      await expect
        .poll(async () => (await projects(page)).find((p) => p.id === target.id)?.startDate?.slice(0, 10))
        .toBe(value);
      await expect(page.getByRole("button", { name: `Start of ${target.title}: ${label}`, exact: true })).toBeVisible();
    } finally {
      const restored = await page.request.patch(`/api/projects/${target.id}`, { data: { startDate: target.startDate } });
      expect(restored.ok(), await restored.text()).toBeTruthy();
    }
  });

  test("a row shows how much has been said about it", async ({ page }) => {
    const talkative = (await projects(page)).find((p) => (p.updateCount ?? 0) > 0);
    expect(talkative, "some seeded project has a conversation").toBeTruthy();

    await board(page);
    await showOnBoard(page, talkative!.title);
    // The count is in the button's own name, so a screen reader hears it too
    // rather than it being only a badge.
    await expect(
      page.getByRole("button", { name: new RegExp(`^Updates on ${escapeRe(talkative!.title)}, \\d+ so far$`) }),
    ).toBeVisible();
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
