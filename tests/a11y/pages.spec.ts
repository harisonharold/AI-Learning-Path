import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { signIn, sql, userId } from "../support/stack.ts";

/** AT-13 starts in P1; P0 runs it on every page that exists, in both themes. */
const PAGES = ["/today", "/roadmap", "/learn", "/learn/w01-tooling", "/learn/w03-caches", "/learn/w04-os", "/learn/w05-concurrency", "/learn/w06-networking", "/learn/w07-go-dsa", "/learn/w08-db-internals", "/gates/g-w01", "/gates/g-w02", "/lab", "/lab/exercises/ex-w01-log-levels",
  "/workspace", "/diagnostic", "/diagnostic/result", "/research", "/research/projects", "/analytics/benchmarks", "/open-source", "/mentor", "/interview", "/portfolio",
  "/analytics", "/settings"];
/** P2: the project workspace on its default, runs and report tabs (the project comes from tests/e2e/p2-lab.spec.ts). */
const PROJECT_TABS = ["", "#runs", "#report"];

for (const theme of ["light", "dark"] as const) {
  test.describe(`${theme} theme`, () => {
    test.use({ colorScheme: theme });
    test("sign-in page has no serious/critical axe violations", async ({ page }) => {
      await page.context().clearCookies();
      await page.goto("/signin");
      const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
      expect(r.violations.filter((v) => ["serious", "critical"].includes(v.impact ?? "")).map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
    });
    for (const tab of PROJECT_TABS) {
      test(`/research/projects/[id]${tab} has no serious/critical axe violations`, async ({ page }) => {
        await signIn(page);
        const id = sql(`SELECT id FROM projects WHERE user_id='${userId()}' AND is_mock=0 ORDER BY id DESC LIMIT 1`)[0];
        test.skip(!id, "needs the project created by p2-lab.spec.ts");
        await page.goto(`/research/projects/${id}${tab}`);
        await page.waitForLoadState("networkidle");
        const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
        expect(r.violations.filter((v) => ["serious", "critical"].includes(v.impact ?? "")).map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
      });
    }
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
