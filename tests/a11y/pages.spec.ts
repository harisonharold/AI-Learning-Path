import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { signIn } from "../support/stack.ts";

/** AT-13 starts in P1; P0 runs it on every page that exists, in both themes. */
const PAGES = ["/today", "/roadmap", "/learn", "/learn/w01-tooling", "/learn/w03-caches", "/gates/g-w01", "/gates/g-w02", "/lab", "/lab/exercises/ex-w01-log-levels",
  "/workspace", "/diagnostic", "/diagnostic/result", "/research", "/open-source", "/mentor", "/interview", "/portfolio", "/analytics", "/settings"];

for (const theme of ["light", "dark"] as const) {
  test.describe(`${theme} theme`, () => {
    test.use({ colorScheme: theme });
    test("sign-in page has no serious/critical axe violations", async ({ page }) => {
      await page.context().clearCookies();
      await page.goto("/signin");
      const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
      expect(r.violations.filter((v) => ["serious", "critical"].includes(v.impact ?? "")).map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
    });
    for (const path of PAGES) {
      test(`${path} has no serious/critical axe violations`, async ({ page }) => {
        await signIn(page);
        await page.goto(path);
        await page.waitForLoadState("networkidle");
        const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
        expect(r.violations.filter((v) => ["serious", "critical"].includes(v.impact ?? "")).map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
      });
    }
  });
}
