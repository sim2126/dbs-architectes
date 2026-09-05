import { test, expect } from "@playwright/test";
import { stateFor } from "./roles";

test("saved-view cap remains forty under concurrent saves and still allows replacement", async ({ browser }) => {
  test.setTimeout(90_000);
  const context = await browser.newContext({ storageState: stateFor("employee") });
  const prefix = `Cap regression ${Date.now()} `;
  const state = { view: {}, layout: "table", groupBy: "phase", search: "retained search" };
  const list = async () => {
    const response = await context.request.get("/api/board-views?board=projects");
    expect(response.ok(), await response.text()).toBeTruthy();
    return (await response.json()).views as { id: string; name: string }[];
  };
  const save = (name: string) => context.request.post("/api/board-views", {
    data: { board: "projects", name, state },
  });
  try {
    const existing = await list();
    expect(existing.length, "isolated demo fixture must have room for the cap regression").toBeLessThan(39);
    for (let index = existing.length; index < 39; index++) {
      const response = await save(`${prefix}${index}`);
      expect(response.status(), await response.text()).toBe(201);
    }
    const responses = await Promise.all(Array.from({ length: 8 }, (_, index) => save(`${prefix}race ${index}`)));
    expect(responses.map((response) => response.status()).sort()).toEqual([201, 409, 409, 409, 409, 409, 409, 409]);
    expect(await list()).toHaveLength(40);
    const replacement = await save(`${prefix}${existing.length}`);
    expect(replacement.status(), await replacement.text()).toBe(201);
    expect((await replacement.json()).state.search).toBe("retained search");
    expect(await list()).toHaveLength(40);
  } finally {
    // Never delete pre-existing views, even when an assertion above fails.
    for (const view of (await list()).filter((item) => item.name.startsWith(prefix))) {
      const response = await context.request.delete(`/api/board-views/${view.id}`);
      expect(response.ok(), await response.text()).toBeTruthy();
    }
    await context.close();
  }
});
