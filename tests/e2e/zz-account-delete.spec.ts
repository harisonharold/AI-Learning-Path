import { expect, test } from "@playwright/test";
import { mockRequests, mockReset, signIn, sql } from "../support/stack.ts";

// Runs last (file name): deletes the signed-in account.
test("X-14: deleting the account removes all rows, makes no GitHub call, and shows revoke-by-hand steps", async ({ page }) => {
  await signIn(page);
  await mockReset();
  await page.goto("/settings");
  await page.getByLabel("Type DELETE MY ACCOUNT to confirm").fill("DELETE MY ACCOUNT");
  await page.getByRole("button", { name: "Delete my account" }).click();
  const help = page.getByTestId("revoke-help");
  await expect(help.getByRole("heading", { name: "Account deleted" })).toBeVisible();
  await expect(help).toContainText("Systems Atlas did not contact GitHub");
  await expect(help.getByRole("listitem")).toHaveCount(4);
  await expect(help).toContainText("Unverified link");
  expect(await mockRequests()).toEqual([]);
  expect(sql("SELECT COUNT(*) FROM `user`")).toEqual(["0"]);
  expect(sql("SELECT COUNT(*) FROM jobs")).toEqual(["0"]);
  expect(sql("SELECT action FROM audit_log WHERE action='account.delete'")).toEqual(["account.delete"]);
  expect((await page.request.get("/api/me")).status()).toBe(401);
});
