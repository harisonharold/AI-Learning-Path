import { expect, test, type Page } from "@playwright/test";
import { passGateFixture, resetLearning, signIn, sql, userId } from "../support/stack.ts";

test.describe.configure({ mode: "serial" });
test.beforeAll(async ({ browser }) => { const p = await browser.newPage(); await signIn(p); await p.close(); resetLearning(); });

const SOLUTION = `LEVELS = {"DEBUG", "INFO", "WARN", "ERROR"}

def count_levels(lines):
    counts = {}
    for line in lines:
        parts = line.split()
        if len(parts) > 1 and parts[1] in LEVELS:
            counts[parts[1]] = counts.get(parts[1], 0) + 1
    return counts
`;

async function setEditor(page: Page, code: string) {
  // Monaco is loaded by its AMD loader, which exposes window.monaco; fall back to the textarea if it is not there.
  const hasMonaco = await page.waitForFunction(() => Boolean((window as unknown as { monaco?: unknown }).monaco), null, { timeout: 20000 }).then(() => true, () => false);
  if (hasMonaco) await page.evaluate((c) => (window as unknown as { monaco: { editor: { getModels(): { setValue(v: string): void }[] } } }).monaco.editor.getModels()[0]!.setValue(c), code);
  else await page.getByLabel("Your solution (Python)").fill(code);
}
async function sandboxReady(page: Page) {
  await expect(page.getByRole("button", { name: "Run practice checks" })).toBeEnabled({ timeout: 60000 });
}

test("roadmap: day 1 only week 1 is available; graph, timeline and list views exist", async ({ page }) => {
  await signIn(page);
  await page.goto("/roadmap");
  await expect(page.locator(".react-flow__node")).toHaveCount(24);
  await page.getByRole("tab", { name: "Timeline" }).click();
  await page.getByRole("tab", { name: "List" }).click();
  const rows = page.locator("tbody tr");
  await expect(rows).toHaveCount(24);
  await expect(rows.nth(0).locator("[data-state]")).toHaveAttribute("data-state", "available");
  await expect(rows.nth(1).locator("[data-state]")).toHaveAttribute("data-state", "locked");
  await expect(rows.nth(1)).toContainText("Python, Git and Linux tooling");
});

test("AT-08: Pyodide practice checks run in the browser, are recorded as practice, and no code is sent to the server", async ({ page }) => {
  await signIn(page);
  const bodies: string[] = [];
  page.on("request", (r) => { if (r.url().startsWith("http://localhost:3000/") && r.postData()) bodies.push(r.postData()!); });
  await page.goto("/lab/exercises/ex-w01-log-levels");
  await expect(page.getByText("Practice check — doesn't count toward gates")).toBeVisible();
  await sandboxReady(page);
  await setEditor(page, SOLUTION);
  await page.getByRole("button", { name: "Run practice checks" }).click();
  const results = page.getByTestId("practice-results");
  await expect(results.locator("li")).toHaveCount(3, { timeout: 90000 });
  await expect(results.locator("li[data-passed=true]")).toHaveCount(3);
  await expect(page.getByText("Recorded as a practice check (does not count toward the gate).")).toBeVisible();
  expect(bodies.some((b) => b.includes("def count_levels"))).toBe(false);
  expect(sql(`SELECT source, status FROM attempts WHERE user_id='${userId()}' AND exercise_id='ex-w01-log-levels' ORDER BY id DESC LIMIT 1`)).toEqual(["browser\tpractice"]);
  await page.goto("/gates/g-w01");
  await expect(page.locator("[data-state]").first()).not.toHaveAttribute("data-state", "passed");
});

test("X-05: the sandbox runs on a separate origin with no cookies; code cannot call the app API", async ({ page }) => {
  await signIn(page);
  await page.goto("/lab/exercises/ex-w01-log-levels");
  await sandboxReady(page);
  const frame = page.frameLocator("[data-testid=sandbox-frame]");
  const src = await page.getByTestId("sandbox-frame").getAttribute("src");
  expect(new URL(src!).origin).toBe("http://127.0.0.1:3000");
  expect(await frame.locator("body").evaluate(() => document.cookie)).toBe("");
  expect(await frame.locator("body").evaluate(async () => (await fetch("/api/me")).status)).toBe(404);
  await setEditor(page, `
from pyodide.http import pyfetch
async def probe():
    r = await pyfetch("http://localhost:3000/api/me")
    print("STATUS", r.status)
await probe()
`);
  await page.getByRole("button", { name: "Run practice checks" }).click();
  const out = page.locator("section[aria-labelledby=res-title] pre");
  await expect(out).toBeVisible({ timeout: 60000 });
  await expect(out).not.toContainText("STATUS 200");
  await expect(out).toContainText(/Failed to fetch|NetworkError|Content Security Policy|connect-src|JsException/i);
});

test("X-05: messages from any origin other than the sandbox are ignored", async ({ page }) => {
  await signIn(page);
  await page.goto("/lab/exercises/ex-w01-log-levels");
  await sandboxReady(page);
  await page.evaluate(() => window.postMessage({ type: "result", id: "x", ok: true, stdout: "FORGED", stderr: "", tests: [{ name: "forged", passed: true, message: "" }] }, "*"));
  await page.waitForTimeout(500);
  await expect(page.getByText("FORGED")).toHaveCount(0);
  await expect(page.getByTestId("practice-results")).toHaveCount(0);
});

test("AT-12: lesson resources show verified_at, and a stale warning after 30 days", async ({ page }) => {
  await signIn(page);
  await page.goto("/learn/w01-tooling");
  const res = page.locator("[data-resource]");
  await expect(res).toHaveCount(5);
  for (const r of await res.all()) await expect(r).toContainText(/Verified 2026-11-16|Stale/);
  sql("UPDATE sources SET verified_at='2026-10-01 00:00:00' WHERE url='https://missing.csail.mit.edu/'");
  await page.reload();
  await expect(page.locator("[data-resource=missing-semester]")).toHaveAttribute("data-freshness", "stale");
  await expect(page.locator("[data-resource=missing-semester]")).toContainText("Stale — verified 2026-10-01, re-check");
  sql("UPDATE sources SET verified_at='2026-11-16 00:00:00' WHERE url='https://missing.csail.mit.edu/'");
});

test("gate quiz is graded on the server; the gate stays pending until the atlas-lab result exists (AT-07)", async ({ page }) => {
  await signIn(page);
  await page.goto("/gates/g-w01");
  const answers = [2, 0, 1, 0, 1, 1, 1, 2, 2, 1];
  const qs = page.locator("form[aria-labelledby=quiz-q-w01] fieldset");
  for (let i = 0; i < 10; i++) await qs.nth(i).getByRole("radio").nth(answers[i]!).check();
  await page.getByRole("button", { name: "Submit answers" }).click();
  await expect(page.getByText("Score 10/10 (100%): passed.")).toBeVisible();
  await expect(page.locator("[data-requirement=server_graded]")).toHaveAttribute("data-satisfied", "true");
  await expect(page.locator("[data-requirement=runner_result]")).toHaveAttribute("data-satisfied", "false");
  expect(await page.content()).not.toContain("atlas-answer-key-canary");
});

test("AT-14: keyboard-only core flow — open Today, take the quiz, open a lesson, run an exercise", async ({ page }) => {
  await signIn(page);
  passGateFixture("g-w01", "atlas-lab:w01@1"); // W1 passed so W1 cards become "earlier week" cards
  await page.request.post("/api/cards", { data: { lesson: "w01-tooling" }, headers: { origin: "http://localhost:3000" } });

  await page.goto("/today");
  await page.keyboard.press("Tab"); // skip link
  await page.keyboard.press("Enter");
  // Reach "start the retrieval quiz" by keyboard only.
  let found = false;
  for (let i = 0; i < 60 && !found; i++) { await page.keyboard.press("Tab"); found = (await page.evaluate(() => document.activeElement?.textContent)) === "start the retrieval quiz"; }
  expect(found).toBe(true);
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/workspace$/);
  for (let i = 0; i < 15; i++) {
    await expect(page.getByTestId("card-front")).toBeVisible();
    await expect(page.getByRole("button", { name: /Show answer/ })).toBeFocused(); // autoFocus = hydrated
    await page.keyboard.press(" ");
    await expect(page.getByTestId("card-back")).toBeVisible();
    await page.keyboard.press("3");
  }
  await expect(page.getByText("Done: 15 card(s) reviewed.")).toBeVisible();
  expect(Number(sql(`SELECT COUNT(*) FROM card_reviews WHERE user_id='${userId()}'`)[0])).toBe(15);

  // Open a lesson via the command palette, keyboard only.
  await page.keyboard.press("Control+k");
  await page.keyboard.type("Learn");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/learn$/);
  await page.locator("main").focus();
  await page.keyboard.press("j");
  await expect(page.locator("[data-keylist-item]").first()).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/learn\/w01-tooling$/);

  // Run an exercise: Tab to the practice link, then to the run button.
  found = false;
  for (let i = 0; i < 120 && !found; i++) { await page.keyboard.press("Tab"); found = (await page.evaluate(() => document.activeElement?.textContent)) === "Practice: Count log levels"; }
  expect(found).toBe(true);
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/lab\/exercises\/ex-w01-log-levels$/);
  await sandboxReady(page);
  found = false;
  for (let i = 0; i < 40 && !found; i++) { await page.keyboard.press("Tab"); found = (await page.evaluate(() => document.activeElement?.textContent)) === "Run practice checks"; }
  expect(found).toBe(true);
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("practice-results").locator("li")).toHaveCount(3, { timeout: 90000 });
});

test("diagnostic: pause, I don't know, autosave and result with recommendation", async ({ page }) => {
  await signIn(page);
  await page.goto("/diagnostic");
  await page.getByRole("button", { name: "30 h/week" }).click();
  await page.getByRole("button", { name: "The keys, sorted" }).click();
  await page.getByRole("button", { name: "Pause" }).click();
  await expect(page.getByText("Paused. Your answers are saved; come back any time.")).toBeVisible();
  await page.reload(); // resume after reload: answers were autosaved
  await expect(page.getByText(/Task 2 of 14/)).toBeVisible();
  for (let i = 2; i <= 14; i++) await page.getByRole("button", { name: "I don't know" }).click();
  await page.getByRole("button", { name: "See my results" }).click();
  await expect(page).toHaveURL(/\/diagnostic\/result$/);
  await expect(page.getByText(/Research-Intensive/).first()).toBeVisible();
  await expect(page.getByText("ceil(960 h planned ÷ 30 h/week) = 32 weeks (planning estimate, B.1)")).toBeVisible();
  await expect(page.getByText("Only weeks 1-3, and only by passing their gates with counting evidence.")).toBeVisible();
});
