/**
 * P2 lab end to end, with the real atlas-lab CLI against the running stack:
 * runner token (AT-18) -> atlas-lab gate run in Docker --network none -> runner_result evidence on g-w01;
 * project + pre-registration -> UI upload (AT-15) and atlas-lab experiment runs incl. a failed run -> stats job CIs ->
 * report (AT-19) -> analytics charts and diffs; sample data banner and exclusion (AT-20).
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { signIn, sql, userId } from "../support/stack.ts";

test.describe.configure({ mode: "serial" });
const root = new URL("../../", import.meta.url).pathname;
const work = mkdtempSync(join(tmpdir(), "atlas-e2e-"));
const cliEnv = { ...process.env, XDG_CONFIG_HOME: join(work, "cfg") };
let token = "";
let projectId = 0;

function atlasLab(args: string[], input?: string): string {
  try {
    return execFileSync("uv", ["run", "--frozen", "--project", root, "atlas-lab", ...args], { cwd: work, env: cliEnv, encoding: "utf8", input, stdio: ["pipe", "pipe", "pipe"], timeout: 300_000 });
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string };
    throw new Error(`atlas-lab ${args.join(" ")} failed:\n${err.stdout}\n${err.stderr}`);
  }
}

test.beforeAll(async ({ browser }) => {
  const p = await browser.newPage();
  await signIn(p);
  await p.close();
  const u = userId();
  sql(`DELETE FROM projects WHERE user_id='${u}'`);
  sql(`DELETE FROM runner_tokens WHERE user_id='${u}'`);
  sql(`DELETE FROM attempts WHERE user_id='${u}'`);
  sql(`UPDATE user_settings SET sample_data=0 WHERE user_id='${u}'`);
  writeFileSync(join(work, "bench.py"), [
    "import random, sys",
    "median = float(sys.argv[1])",
    "rng = random.Random(int(sys.argv[2]) if len(sys.argv) > 2 else 7)",
    "for _ in range(300):",
    "    print('ATLAS_METRIC latency_ms ms', round(median * rng.lognormvariate(0, 0.2), 3))",
    "    print('ATLAS_METRIC tokens_per_s tokens/s', round(1000 / median * rng.uniform(0.9, 1.1), 2))",
  ].join("\n"));
  writeFileSync(join(work, "b1.json"), JSON.stringify({ batch_size: 1 }));
  writeFileSync(join(work, "b8.json"), JSON.stringify({ batch_size: 8 }));
});

test("AT-18 (UI): a runner token is shown once, listed by prefix, and works for atlas-lab login", async ({ page }) => {
  await signIn(page);
  await page.goto("/settings");
  await page.getByRole("button", { name: "Create token" }).click();
  const shown = page.locator("[data-new-token] code.block");
  await expect(shown).toHaveText(/^atl_[A-Za-z0-9_-]{43}$/);
  token = (await shown.textContent())!;
  await page.reload();
  await expect(page.locator("[data-new-token]")).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText(token);
  await expect(page.locator("[data-token-id]").first()).toContainText(token.slice(0, 8));
  const out = atlasLab(["login", "--url", "http://localhost:3000", "--token-stdin"], `${token}\n`);
  expect(out).toContain("Logged in");
  expect(out).not.toContain(token);
});

test("atlas-lab runs the W1 hidden tests in Docker with no network and the gate records runner_result evidence", async ({ page }) => {
  const out = atlasLab(["run", "ex-w01-log-levels", "--solution", join(root, "content/exercises/ex-w01-log-levels/solution.py")]);
  expect(out).toMatch(/8\/8 passed/);
  expect(out).toContain("Recorded on gate g-w01");
  await signIn(page);
  await page.goto("/gates/g-w01");
  await expect(page.locator('[data-requirement="runner_result"]')).toHaveAttribute("data-satisfied", "true");
  // The quiz half is still open, so the gate itself is not passed yet.
  await expect(page.locator('[data-requirement="server_graded"]')).toHaveAttribute("data-satisfied", "false");
});

test("project: create, pre-register, upload a JSON run from the browser (AT-15)", async ({ page }) => {
  await signIn(page);
  await page.goto("/research/projects");
  await page.getByLabel("Title").fill("Batching vs latency");
  await page.getByRole("button", { name: "Create project" }).click();
  await page.waitForURL(/\/research\/projects\/\d+$/);
  projectId = Number(page.url().split("/").pop());
  await page.getByRole("textbox", { name: "Hypothesis" }).fill("Batch size 8 lowers p50 latency against batch size 1.");
  await page.getByLabel("Primary metric (as uploaded, e.g. latency_ms)").fill("latency_ms");
  await page.getByLabel("Baseline").fill("batch size 1");
  await page.getByLabel("Stopping rule").fill("3 ok runs per config");
  await page.getByLabel("Minimum repetitions per config").fill("3");
  await page.getByRole("button", { name: "Pre-register" }).click();
  await expect(page.getByText("(fixed; changes go in amendments)")).toBeVisible();

  const fixture = JSON.parse(readFileSync(join(root, "packages/contracts/fixtures/benchmark.valid.json"), "utf8"));
  const file = join(work, "upload.json");
  writeFileSync(file, JSON.stringify({ ...fixture, project_id: projectId, config_name: "uploaded" }));
  await page.getByRole("tab", { name: /Runs/ }).click();
  await page.getByLabel(/Benchmark JSON/).setInputFiles(file);
  await page.getByRole("button", { name: "Upload run" }).click();
  await expect(page.getByText(/Stored run #\d+/)).toBeVisible();
  // The client's summary claimed p50 = 1; the stored p50 is the server's (12.25 for the fixture samples).
  await expect(page.locator("[data-run]").first()).toContainText("12.25 ms");
});

test("atlas-lab experiments: baseline and candidate runs with warm-ups, a failed run kept, stats CIs computed", async ({ page }) => {
  const common = ["--project", String(projectId), "--repeat", "3", "--warmup", "1"];
  expect(atlasLab(["run", "batch1", "--config", "b1.json", "--config-name", "batch=1", "--baseline", ...common, "--", "python3", "bench.py", "20", "1"])).toMatch(/uploaded run \d+/);
  expect(atlasLab(["run", "batch8", "--config", "b8.json", "--config-name", "batch=8", ...common, "--", "python3", "bench.py", "15", "2"])).toMatch(/uploaded run \d+/);
  const failed = atlasLab(["run", "batch8", "--config", "b8.json", "--config-name", "batch=8", "--project", String(projectId), "--repeat", "1", "--warmup", "0", "--", "python3", "-c", "raise SystemExit('CUDA out of memory')"]);
  expect(failed).toContain("FAILED");
  expect(failed).toMatch(/uploaded run \d+/);
  await signIn(page);
  await page.goto(`/research/projects/${projectId}#runs`);
  await expect(page.locator("[data-run]")).toHaveCount(10);
  // Every stats job finishes (bootstrap CIs are added by worker-py).
  await expect.poll(async () => { await page.reload(); return page.locator("td", { hasText: /^pending$/ }).count(); }, { timeout: 90_000 }).toBe(0);
  await page.getByRole("tab", { name: /Failures/ }).click();
  await expect(page.getByRole("tabpanel")).toContainText("CUDA out of memory");
});

test("AT-19: the report is generated from stored runs and keeps the failed run", async ({ page }) => {
  await signIn(page);
  await page.goto(`/research/projects/${projectId}#report`);
  const button = page.getByRole("button", { name: "Generate report" });
  await expect(button).toHaveAttribute("aria-disabled", "false");
  await button.click();
  const done = page.locator('[data-report][data-status="done"]');
  await expect(done).toHaveCount(1, { timeout: 90_000 });
  const id = await done.getAttribute("data-report");
  const md = await (await page.request.get(`/api/reports/${id}?format=md`)).text();
  expect(md).toContain("## Comparisons against the baseline");
  expect(md).toContain("failed or invalid");
  expect(md).toContain("CUDA out of memory");
  const html = await page.request.get(`/api/reports/${id}?format=html`);
  expect(html.headers()["content-disposition"]).toContain("attachment");
  const doc = await html.text();
  expect(doc).toMatch(/batch=8 has a [0-9.]+% lower latency_ms p50 than the baseline batch=1 \(95% CI/);
  expect(doc).not.toContain("<script");
});

test("benchmark analytics: charts with summaries and tables, CIs, differences and config diff", async ({ page }) => {
  await signIn(page);
  await page.goto(`/analytics/benchmarks?project=${projectId}`);
  await expect(page.locator('[data-chart="cdf"] canvas')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('[data-chart-summary="cdf"]')).toContainText("Lowest median");
  await expect(page.locator('[data-chart-summary="tput"]')).toContainText("tokens_per_s");
  await expect(page.getByRole("heading", { name: /Differences against #/ })).toBeVisible();
  await expect(page.locator("[data-degraded]")).toHaveCount(0);
  await expect(page.getByText("batch_size").first()).toBeVisible();
  await page.getByText("Data table: CDF of latency_ms").click();
  await expect(page.locator("details[open] table").first()).toBeVisible();
});

test("AT-20: sample data shows the SAMPLE DATA banner and is never reportable", async ({ page }) => {
  await signIn(page);
  await page.goto("/settings");
  await page.getByLabel("Show sample lab data").check();
  await expect(page.getByText("Sample project created")).toBeVisible();
  await page.goto("/research/projects");
  await page.getByRole("link", { name: /SAMPLE DATA: request batching/ }).click();
  await expect(page.getByText("SAMPLE DATA", { exact: false }).first()).toBeVisible();
  await expect(page.locator(".mock-banner")).toBeVisible();
  await page.getByRole("tab", { name: "Report" }).click();
  await expect(page.getByRole("button", { name: "Generate report" })).toHaveAttribute("aria-disabled", "true");
  await expect(page.getByText("sample data never goes into reports")).toBeVisible();
  const mockId = page.url().match(/projects\/(\d+)/)![1];
  await page.goto(`/analytics/benchmarks?project=${mockId}`);
  await expect(page.locator(".mock-banner")).toBeVisible();
  await page.goto("/settings");
  await page.getByLabel("Show sample lab data").uncheck();
  await expect(page.getByText("Sample data removed")).toBeVisible();
});
