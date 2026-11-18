import AxeBuilder from "@axe-core/playwright";
import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { signIn, sql, userId } from "../support/stack.ts";

/** AT-13 starts in P1; P0 runs it on every page that exists, in both themes. */
const PAGES = ["/today", "/roadmap", "/learn", "/learn/w01-tooling", "/learn/w03-caches", "/learn/w04-os", "/learn/w05-concurrency", "/learn/w06-networking", "/learn/w07-go-dsa", "/learn/w08-db-internals", "/gates/g-w01", "/gates/g-w02", "/lab", "/lab/exercises/ex-w01-log-levels",
  "/workspace", "/diagnostic", "/diagnostic/result", "/research", "/research/projects", "/analytics/benchmarks", "/open-source", "/mentor", "/interview", "/portfolio",
  "/analytics", "/settings"];
/** P2: the project workspace on its default, runs and report tabs. The e2e account-delete test removes earlier data,
 * so this creates a pre-registered project with one uploaded run when none exists. */
const PROJECT_TABS = ["", "#runs", "#report"];
const ORIGIN = { origin: process.env.E2E_BASE_URL ?? "http://localhost:3000" };
async function ensureProject(page: Page): Promise<string> {
  const found = sql(`SELECT id FROM projects WHERE user_id='${userId()}' AND is_mock=0 ORDER BY id DESC LIMIT 1`)[0];
  if (found) return found;
  const { id } = await (await page.request.post("/api/projects", { headers: ORIGIN, data: { title: "Axe check project", hypothesis: "Batching lowers p50" } })).json() as { id: number };
  await page.request.patch(`/api/projects/${id}`, { headers: ORIGIN, data: { prereg: { primary_metric: "latency_ms", baseline_desc: "batch=1", stopping_rule: "3 runs", min_repetitions: 3 } } });
  const fixture = JSON.parse(readFileSync(new URL("../../packages/contracts/fixtures/benchmark.valid.json", import.meta.url), "utf8"));
  await page.request.post(`/api/projects/${id}/runs`, { headers: ORIGIN, data: { ...fixture, project_id: id } });
  return String(id);
}

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
        const id = await ensureProject(page);
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
