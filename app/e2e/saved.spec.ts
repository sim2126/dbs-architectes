import { test, expect } from "@playwright/test";
import { expectAccessible } from "./a11y";
import { stateFor } from "./roles";

/**
 * Saved AI responses (Annexure A.2 item 7): a reply in a DBS AI conversation
 * can be kept, and the kept copy is listed under Saved in the page sidebar.
 * Uses a seeded conversation, so no model call is needed.
 */
test.describe("saved AI responses", () => {
  test.use({ storageState: stateFor("pm") });

  test("a reply can be saved and appears under Saved", async ({ page }) => {
    // A seeded conversation that holds an assistant reply, opened by its URL.
    // This must work with no AI provider configured, as in CI: history and
    // Save are reading features, only the composer depends on the model.
    const sessions = (await (await page.request.get("/api/ai-chats")).json()) as { id: string; title: string }[];
    expect(sessions.length, "the seed gives each role account conversations").toBeGreaterThan(0);
    let target: { id: string; title: string } | undefined;
    for (const s of sessions) {
      const detail = (await (await page.request.get(`/api/ai-chats/${s.id}`)).json()) as {
        messages: { role: string; content: string }[];
      };
      if (detail.messages.some((m) => m.role === "assistant" && m.content)) {
        target = s;
        break;
      }
    }
    expect(target, "a seeded conversation with an assistant reply").toBeTruthy();
    const before = ((await (await page.request.get("/api/ai-saved")).json()) as unknown[]).length;

    await page.goto(`/dashboard/ai/gpt?chat=${target!.id}`);
    await expect(page.getByRole("button", { name: /^Copy/ }).first()).toBeVisible();

    const save = page.getByRole("button", { name: "Save", exact: true }).first();
    await expect(save).toBeVisible();
    await save.click();

    await expect(page.getByText(/^Saved\./)).toBeVisible();
    await expect
      .poll(async () => ((await (await page.request.get("/api/ai-saved")).json()) as unknown[]).length)
      .toBe(before + 1);
    await expectAccessible(page, "dbs-ai-conversation");
  });
});
