/** AT-47 / NFR-5: with api-py stopped, benchmark analytics shows the stored summaries and a degraded banner.
 * Runs late (zy-) because it stops and restarts a container. */
import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";
import { signIn, sql, userId } from "../support/stack.ts";

const root = new URL("../../", import.meta.url).pathname;
const compose = (...args: string[]) =>
  execFileSync("docker", ["compose", "--env-file", ".env", "-f", "infra/compose/compose.yaml", "-f", "infra/compose/compose.test.yaml", ...args], { cwd: root, stdio: "ignore", timeout: 180_000 });

test("AT-47: analytics degrades to stored summaries when api-py is down", async ({ page }) => {
  await signIn(page);
  const pid = sql(`SELECT p.id FROM projects p JOIN runs r ON r.project_id = p.id WHERE p.user_id='${userId()}' AND p.is_mock=0 GROUP BY p.id HAVING COUNT(r.id) >= 2 LIMIT 1`)[0];
  test.skip(!pid, "needs a project with two runs (created by p2-lab.spec.ts)");
  compose("stop", "api-py");
  try {
    await page.goto(`/analytics/benchmarks?project=${pid}`);
    await expect(page.locator("[data-degraded]")).toContainText("Statistics service unavailable");
    // Stored percentiles are still shown.
    await expect(page.getByRole("heading", { name: /p50 \/ p95 \/ p99/ })).toBeVisible();
    await expect(page.locator("table").first()).toContainText(/\d/);
  } finally {
    compose("start", "api-py");
    compose("up", "-d", "--wait", "api-py");
  }
  await page.goto(`/analytics/benchmarks?project=${pid}`);
  await expect(page.locator("[data-degraded]")).toHaveCount(0);
});
