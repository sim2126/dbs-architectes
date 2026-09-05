import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * WCAG 2.1 AA scan of the current page. Two rules: axe reports no serious or
 * critical violation against the WCAG 2.0/2.1 A and AA tag sets, and every
 * finding, blocking or not, is recorded on the test so the trend is visible.
 * Moderate and minor findings do not fail the run yet; the bar tightens once
 * the current count is zero.
 */
export async function expectAccessible(page: Page, label: string) {
  // Let entrance transitions finish. The sidebar animates labels in from
  // opacity 0 and axe evaluated a mid-transition frame as invisible text.
  await page.evaluate(() =>
    Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined))),
  );
  await page.waitForTimeout(150);
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const blocking = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  const summary = results.violations.map((v) => `${v.impact}: ${v.id} ×${v.nodes.length}`).join("\n  ");
  test.info().annotations.push({ type: "a11y", description: `${label}: ${results.violations.length} violations\n  ${summary}` });
  expect(blocking, `${label} has serious/critical WCAG violations:\n  ${summary}`).toEqual([]);
}
