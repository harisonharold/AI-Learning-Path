import { expect, test } from "@playwright/test";
import { signIn } from "../support/stack.ts";

test.beforeEach(async ({ page }) => { await signIn(page); });

test("left rail lists the E.2 navigation in order", async ({ page }) => {
  const labels = await page.getByRole("navigation", { name: "Primary" }).getByRole("link").allInnerTexts();
  expect(labels).toEqual(["Today", "Roadmap", "Learn", "Lab", "Research", "Open Source", "Mentor", "Interview", "Portfolio", "Analytics", "Settings"]);
});

test("keyboard: skip link, Ctrl+K palette, g-chords and the ? sheet", async ({ page }) => {
  await page.goto("/today");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
  await page.keyboard.press("Control+k");
  const box = page.getByRole("combobox", { name: "Search pages" });
  await expect(box).toBeFocused();
  await page.keyboard.type("sett");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/settings$/);
  await page.locator("body").click({ position: { x: 900, y: 600 } });
  await page.keyboard.press("g");
  await page.keyboard.press("r");
  await expect(page).toHaveURL(/\/roadmap$/);
  await page.keyboard.press("Shift+?");
  await expect(page.getByRole("dialog", { name: "Keyboard shortcuts" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("security headers: nonce CSP, frame-src limited to the sandbox origin, no framing", async ({ page }) => {
  const res = await page.goto("/today");
  const csp = res!.headers()["content-security-policy"]!;
  expect(csp).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/);
  expect(csp).toContain("frame-src http://127.0.0.1:3000");
  expect(csp).toContain("frame-ancestors 'none'");
  expect(res!.headers()["x-content-type-options"]).toBe("nosniff");
});

test("sandbox host split (D-14, P0 part): the app host 404s /sandbox; the sandbox host serves only /sandbox and sets no cookies", async ({ request }) => {
  expect((await request.get("http://localhost:3000/sandbox/index.html")).status()).toBe(404);
  const sb = await request.get("http://127.0.0.1:3000/sandbox/index.html");
  expect(sb.status()).toBe(200);
  expect(sb.headers()["set-cookie"]).toBeUndefined();
  expect((await request.get("http://127.0.0.1:3000/api/me")).status()).toBe(404);
  expect((await request.get("http://127.0.0.1:3000/today")).status()).toBe(404);
});
