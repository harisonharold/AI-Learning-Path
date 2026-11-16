import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";
import { dotenv, mockRequests, mockReset, signIn, sql } from "../support/stack.ts";

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => { await mockReset(); });

test("X-01b: a GitHub account that is not allowlisted is refused and no rows are written", async ({ page }) => {
  await signIn(page, { expectRefusal: true, as: { id: 424242, login: "someone-else" } });
  await expect(page).toHaveURL(/\/signin/);
  await expect(page.getByText("Sign-in was refused or failed")).toBeVisible();
  expect(sql("SELECT COUNT(*) FROM account WHERE account_id='424242'")).toEqual(["0"]);
  expect(sql("SELECT COUNT(*) FROM `user` WHERE email LIKE '424242%'")).toEqual(["0"]);
  expect(sql("SELECT COUNT(*) FROM audit_log WHERE action='auth.signup_rejected' AND target='github:424242'")[0]).not.toBe("0");
});

test("X-01c: an account renamed to the owner's login but with another id is refused", async ({ page }) => {
  await signIn(page, { expectRefusal: true, as: { id: 555, login: "harisonharold" } });
  await expect(page).toHaveURL(/\/signin/);
  expect(sql("SELECT COUNT(*) FROM account WHERE account_id='555'")).toEqual(["0"]);
});

test("AT-02 / X-01a: the allowlisted account signs in; /api/me returns the user", async ({ page }) => {
  await signIn(page);
  await expect(page.getByRole("heading", { level: 1, name: "Today" })).toBeVisible();
  const me = await (await page.request.get("/api/me")).json();
  expect(me.user.name).toBe("Harison");
  expect(sql("SELECT account_id FROM account WHERE provider_id='github'")).toEqual(["123658133"]);
});

test("encrypted OAuth tokens: the stored access token is not the plaintext token", async () => {
  const stored = sql("SELECT access_token FROM account WHERE account_id='123658133'")[0] ?? "";
  expect(stored).not.toMatch(/^ghu_mock_/);
  expect(stored.length).toBeGreaterThan(20);
});

test("session cookie is host-only (no Domain) so the sandbox origin never receives it", async ({ page }) => {
  await signIn(page);
  const cookies = await page.context().cookies("http://localhost:3000");
  const s = cookies.find((c) => c.name.endsWith("session_token"));
  expect(s?.httpOnly).toBe(true);
  expect(s?.domain).toBe("localhost");
  expect(await page.context().cookies("http://127.0.0.1:3000")).toEqual([]);
});

test("AT-27 (auth part): across sign-ins the only non-GET request GitHub saw is POST to the token endpoint", async () => {
  const nonGet = (await mockRequests()).filter((r) => r.method !== "GET");
  expect(nonGet.length).toBeGreaterThan(0);
  expect([...new Set(nonGet.map((r) => `${r.method} ${r.path}`))]).toEqual(["POST /login/oauth/access_token"]);
});

test("X-01e: a later sign-up by any other id is still refused", async ({ page }) => {
  await page.context().clearCookies();
  await signIn(page, { expectRefusal: true, as: { id: 777, login: "late-comer" } });
  await expect(page).toHaveURL(/\/signin/);
  expect(sql("SELECT COUNT(*) FROM `user`")).toEqual(["1"]);
});

test("AT-02: without GitHub App credentials the app shows a clear 'configure' page instead of crashing", async ({ browser }) => {
  const env = dotenv();
  const name = "atlas-e2e-unconfigured";
  execFileSync("docker", ["rm", "-f", name], { stdio: "ignore" });
  execFileSync("docker", ["run", "-d", "--name", name, "--network", "systems-atlas_internal", "-p", "127.0.0.1:3001:3000",
    "-e", "APP_ORIGIN=http://localhost:3001", "-e", "SANDBOX_ORIGIN=http://127.0.0.1:3001",
    "-e", `DATABASE_URL=mysql://atlas_app:${env.MYSQL_APP_PASSWORD}@mysql:3306/atlas`, "-e", `REDIS_URL=redis://:${env.REDIS_PASSWORD}@redis:6379`,
    "-e", `BETTER_AUTH_SECRET=${env.BETTER_AUTH_SECRET}`, "-e", `ALLOWED_GITHUB_USER_ID=${env.ALLOWED_GITHUB_USER_ID}`,
    "-e", `TOKEN_ENC_KEY=${env.TOKEN_ENC_KEY}`, "-e", `INTERNAL_HMAC_KEY=${env.INTERNAL_HMAC_KEY}`, "systems-atlas-web"], { stdio: "ignore" });
  try {
    const page = await browser.newPage();
    for (let i = 0; i < 60; i++) { try { if ((await page.request.get("http://localhost:3001/api/healthz")).ok()) break; } catch {} await page.waitForTimeout(500); }
    await page.goto("http://localhost:3001/today");
    await expect(page).toHaveURL("http://localhost:3001/setup");
    await expect(page.getByRole("heading", { name: "Configure GitHub login" })).toBeVisible();
    await expect(page.getByText("GitHub sign-in is not configured.")).toBeVisible();
    expect((await page.request.get("http://localhost:3001/api/me")).status()).toBe(401);
  } finally {
    execFileSync("docker", ["rm", "-f", name], { stdio: "ignore" });
  }
});

test("X-01d: the app refuses to start without ALLOWED_GITHUB_USER_ID (fail closed)", async () => {
  const env = dotenv();
  let out = "";
  try {
    execFileSync("docker", ["run", "--rm", "--network", "systems-atlas_internal", "-e", "APP_ORIGIN=http://localhost:3002", "-e", "SANDBOX_ORIGIN=http://127.0.0.1:3002",
      "-e", `DATABASE_URL=mysql://atlas_app:${env.MYSQL_APP_PASSWORD}@mysql:3306/atlas`, "-e", `REDIS_URL=redis://:${env.REDIS_PASSWORD}@redis:6379`,
      "-e", `BETTER_AUTH_SECRET=${env.BETTER_AUTH_SECRET}`, "-e", `TOKEN_ENC_KEY=${env.TOKEN_ENC_KEY}`, "-e", `INTERNAL_HMAC_KEY=${env.INTERNAL_HMAC_KEY}`,
      "systems-atlas-web"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 60_000 });
  } catch (e) {
    const err = e as { status: number; stderr: string; stdout: string };
    out = err.stderr + err.stdout;
    expect(err.status).toBe(78);
  }
  expect(out).toContain("ALLOWED_GITHUB_USER_ID");
});
