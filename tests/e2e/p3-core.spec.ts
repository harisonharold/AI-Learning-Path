/**
 * P3-core end to end through worker-node and the SSRF guard. worker-node's test-only DNS/dial map sends the hosts
 * below to the in-repo mock server, which serves a course page, the arXiv response recorded on 2026-11-19 and a
 * captcha page. Everything else (scheme/port/host checks, address checks, redirects, limits) runs as in production.
 */
import { expect, test, type Page } from "@playwright/test";
import { signIn, sql, userId } from "../support/stack.ts";

test.describe.configure({ mode: "serial" });

async function reloadUntil(page: Page, check: () => Promise<boolean>, timeoutMs = 45_000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (await check()) return;
    await page.waitForTimeout(1500);
    await page.reload();
  }
  throw new Error("condition not met in time");
}

test.beforeAll(async ({ browser }) => {
  const p = await browser.newPage();
  await signIn(p);
  await p.close();
  sql(`DELETE FROM papers WHERE user_id='${userId()}'`);
  sql(`DELETE FROM sources WHERE external_id IS NULL OR external_id NOT LIKE 'content:%'`);
});

test("AT-12 (live data): a stale lesson resource is re-checked by the verifier and shows today's date", async ({ page }) => {
  sql("UPDATE sources SET verification='verified', verified_at = NOW() - INTERVAL 40 DAY WHERE external_id='content:missing-semester'");
  await signIn(page);
  await page.goto("/learn/w01-tooling");
  const item = page.locator('[data-resource="missing-semester"]');
  await expect(item).toHaveAttribute("data-freshness", "stale");
  await expect(item).toContainText("Stale");
  await item.getByRole("button", { name: "Re-check now" }).click();
  const today = new Date().toISOString().slice(0, 10);
  await reloadUntil(page, async () => (await item.getAttribute("data-freshness")) === "fresh");
  await expect(item).toContainText(`Verified ${today}`);
  expect(sql("SELECT verify_method FROM sources WHERE external_id='content:missing-semester'")[0]).toBe("HTTP GET + page title (safeFetch)");
});

test("AT-22 + AT-26: an arXiv paper gets its title from arXiv and is found by a word in its abstract", async ({ page }) => {
  await signIn(page);
  await page.goto("/research/papers");
  await page.getByLabel("arXiv id (for example 2309.06180)").fill("2309.06180");
  await page.getByRole("button", { name: "Add paper" }).click();
  await expect(page.getByText("Added.")).toBeVisible();
  const paper = page.locator("[data-paper]").first();
  await reloadUntil(page, async () => (await paper.getAttribute("data-verification")) === "verified");
  await expect(paper.getByRole("heading")).toHaveText("Efficient Memory Management for Large Language Model Serving with PagedAttention");
  await expect(paper).toContainText("Woosuk Kwon");
  await page.getByLabel("Search titles, abstracts and your notes").fill("fragmentation");
  await page.getByRole("search").getByRole("button", { name: "Search" }).click();
  await expect(page.getByRole("heading", { name: /Results for "fragmentation" \(1\)/ })).toBeVisible();
});

test("AT-23: a captcha page is stored as partly verified, never verified", async ({ page }) => {
  await signIn(page);
  await page.goto("/research/papers");
  await page.getByLabel("Other URL").check();
  await page.getByLabel("URL", { exact: true }).fill("https://blocked.example.org/paper");
  await page.getByLabel(/^Title/).fill("A paper behind a bot wall");
  await page.getByRole("button", { name: "Add paper" }).click();
  const item = page.locator("[data-paper]", { hasText: "A paper behind a bot wall" });
  await reloadUntil(page, async () => (await item.getAttribute("data-verification")) !== "unverified");
  await expect(item).toHaveAttribute("data-verification", "partial");
  await expect(item).toContainText("captcha or access-denied");
});

test("X-04 end to end: a URL aimed at an internal service is refused by the guard and stored as a failed check", async ({ page }) => {
  await signIn(page);
  await page.goto("/research/papers");
  await page.getByLabel("Other URL").check();
  await page.getByLabel("URL", { exact: true }).fill("http://redis:6379/");
  await page.getByLabel(/^Title/).fill("SSRF probe");
  await page.getByRole("button", { name: "Add paper" }).click();
  const item = page.locator("[data-paper]", { hasText: "SSRF probe" });
  await reloadUntil(page, async () => (await item.getAttribute("data-verification")) === "broken");
  await expect(item).toContainText("Check failed");
  expect(sql("SELECT fetch_block_reason FROM sources WHERE url='http://redis:6379/'")[0]).toBe("port");
});
