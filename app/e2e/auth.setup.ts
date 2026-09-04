import { test as setup, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";

import { ROLES, stateFor, type Role } from "./roles";

/** Logs each demo role in once through the real sign-in form and saves the
 *  cookies. Journeys then start already authenticated. */
mkdirSync("e2e/.auth", { recursive: true });

for (const [role, creds] of Object.entries(ROLES) as Array<[Role, { email: string; password: string }]>) {
  setup(`authenticate as ${role}`, async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel(/email/i).fill(creds.email);
    await page.getByLabel(/^password$/i).fill(creds.password);
    await page.getByRole("button", { name: /enter workspace/i }).click();
    await expect(page).toHaveURL(/\/dashboard/);
    await page.context().storageState({ path: stateFor(role) });
  });
}
