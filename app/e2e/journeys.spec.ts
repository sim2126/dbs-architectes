import { test, expect } from "@playwright/test";
import { expectAccessible } from "./a11y";
import { stateFor } from "./roles";

/**
 * Primary user journeys from DBS_Features.docx, each ending in a WCAG 2.1 AA
 * scan. See ./a11y.ts for what the scan asserts and what it only records.
 */

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
