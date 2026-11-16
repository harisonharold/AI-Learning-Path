import { expect, test } from "@playwright/test";
import { signIn, sql } from "../support/stack.ts";

test("AT-05: web -> Redis/BullMQ -> worker-py -> HMAC callback -> web writes the job as done", async ({ page }) => {
  await signIn(page);
  await page.goto("/settings");
  await page.getByRole("button", { name: "Run diagnostic job" }).click();
  const row = page.locator("tr[data-status]").first();
  await expect(row).toHaveAttribute("data-status", "done", { timeout: 30_000 });
  const id = await row.getAttribute("data-job-id");
  expect(sql(`SELECT status, JSON_EXTRACT(result_json, '$.worker') FROM jobs WHERE id='${id}'`)).toEqual(['done\t"worker-py"']);
});

test("AT-05: a callback with a bad signature returns 401 (in-network, as worker-py would call)", async ({ request }) => {
  const id = sql("SELECT id FROM jobs ORDER BY created_at DESC LIMIT 1")[0]!;
  // From outside, straight at the web container: Caddy is not in front in dev, so this exercises the HMAC check itself.
  const res = await request.post(`/api/internal/jobs/${id}/result`, {
    data: { status: "failed", error: "forged", attempts: 1 },
    headers: { "x-atlas-timestamp": String(Math.floor(Date.now() / 1000)), "x-atlas-nonce": "AAAAAAAAAAAAAAAAAAAAAA", "x-atlas-signature": "0".repeat(64) },
  });
  expect(res.status()).toBe(401);
  expect((await res.json()).error.code).toBe("BAD_SIGNATURE");
  expect(sql(`SELECT status FROM jobs WHERE id='${id}'`)).toEqual(["done"]);
});
