import { expect, test } from "@playwright/test";
import { mockRequests, mockReset, signIn, sql } from "../support/stack.ts";

// Runs last (file name): deletes the signed-in account.
test("X-14: deleting the account removes all rows, makes no GitHub call, and shows revoke-by-hand steps", async ({ page }) => {
  await signIn(page);
  await mockReset();
  // Audit rows outlive the user by design, so count the delete this test adds rather than assuming an empty log.
  const deletesBefore = Number(sql("SELECT COUNT(*) FROM audit_log WHERE action='account.delete'")[0]);
  await page.goto("/settings");
  await page.getByLabel("Type DELETE MY ACCOUNT to confirm").fill("DELETE MY ACCOUNT");
  await page.getByRole("button", { name: "Delete my account" }).click();
  const help = page.getByTestId("revoke-help");
  await expect(help.getByRole("heading", { name: "Account deleted" })).toBeVisible();
  await expect(help).toContainText("Systems Atlas did not contact GitHub");
  await expect(help.getByRole("listitem")).toHaveCount(4);
  // The link's badge comes from its sources row: unverified on a fresh seed, "page needs sign-in" once the job has run.
  await expect(help).toContainText(/Unverified link|Link checked; page needs sign-in/);
  await expect(help).toContainText("The steps below are not verified");
  expect(await mockRequests()).toEqual([]);
  expect(sql("SELECT COUNT(*) FROM `user`")).toEqual(["0"]);
  expect(sql("SELECT COUNT(*) FROM jobs")).toEqual(["0"]);
  expect(Number(sql("SELECT COUNT(*) FROM audit_log WHERE action='account.delete'")[0])).toBe(deletesBefore + 1);
  expect((await page.request.get("/api/me")).status()).toBe(401);
});
