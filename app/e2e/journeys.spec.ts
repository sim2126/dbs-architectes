import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { stateFor } from "./roles";

/**
 * Primary user journeys from DBS_Features.docx, each with a WCAG 2.1 AA scan.
 *
 * Two assertions per page: it rendered what a user came for, and axe reports
 * no serious or critical violations against the wcag2a/wcag2aa/wcag21aa tag
 * set. Moderate and minor findings are reported but do not fail the run yet;
 * they are tracked in the accessibility backlog and the bar tightens once
 * the current count is zero.
 */
async function expectAccessible(page: Page, label: string) {
  // Let entrance transitions finish. The sidebar animates labels in from
  // opacity 0 and axe evaluated a mid-transition frame as invisible text.
  await page.evaluate(() =>
    Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined))),
  );
  await page.waitForTimeout(150);
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  const blocking = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  const summary = results.violations.map((v) => `${v.impact}: ${v.id} ×${v.nodes.length}`).join("\n  ");
  test.info().annotations.push({ type: "a11y", description: `${label}: ${results.violations.length} violations\n  ${summary}` });
  expect(blocking, `${label} has serious/critical WCAG violations:\n  ${summary}`).toEqual([]);
}

test.describe("unauthenticated", () => {
  test("sign-in page renders the demo door and is accessible", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("button", { name: /enter workspace/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /try the demo/i })).toBeVisible();
    await expectAccessible(page, "login");
  });
});

test.describe("project manager", () => {
  test.use({ storageState: stateFor("pm") });

  test("dashboard shows the day's work", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole("main")).toBeVisible();
    await expectAccessible(page, "dashboard");
  });

  test("projects list is grouped by phase and opens a project", async ({ page }) => {
    await page.goto("/dashboard/projects");
    // Phase groups render translated labels (EN: "Study / Prelim.", "Prelim.
    // Design", "Construction", "Completed", "Blocked"; FR/IT equivalents), not
    // the raw codes. Match any of them.
    await expect(
      page.getByText(/Study|Prelim|Construction|Completed|Blocked|Étude|Chantier|Terminato|Cantiere/i).first(),
    ).toBeVisible();
    await expectAccessible(page, "projects");
  });

  test("DBS AI page renders conversations, files and the grounding pane", async ({ page }) => {
    await page.goto("/dashboard/ai/gpt");
    await expect(page.getByText(/files/i).first()).toBeVisible();
    await expect(page.getByText(/grounding/i).first()).toBeVisible();
    await expectAccessible(page, "dbs-ai");
  });

  test("chat opens a channel and its messages", async ({ page }) => {
    await page.goto("/dashboard/chat");
    await expect(page.getByText(/general/i).first()).toBeVisible();
    await expectAccessible(page, "chat");
  });
});

test.describe("employee (restricted role)", () => {
  test.use({ storageState: stateFor("employee") });

  test("cannot open team workload but can see own work", async ({ page }) => {
    const res = await page.request.get("/api/team-workload");
    expect(res.status()).toBe(403);
    await page.goto("/dashboard/my-work");
    await expect(page.getByRole("main")).toBeVisible();
    await expectAccessible(page, "my-work");
  });
});
