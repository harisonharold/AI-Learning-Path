import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import type { Page } from "@playwright/test";

export const MOCK = "http://localhost:4010";
const root = new URL("../../", import.meta.url).pathname;

export function dotenv(): Record<string, string> {
  return Object.fromEntries(
    readFileSync(root + ".env", "utf8").split("\n").filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
  );
}

/** Runs SQL as root inside the mysql container; returns rows as tab-separated lines. */
export function sql(query: string): string[] {
  const out = execFileSync("docker", ["compose", "--env-file", ".env", "-f", "infra/compose/compose.yaml", "exec", "-T", "mysql",
    "mysql", "-uroot", `-p${dotenv().MYSQL_ROOT_PASSWORD}`, "atlas", "-N", "-B", "-e", query], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  return out.split("\n").filter(Boolean);
}

export async function mockUser(u: { id: number; login: string } | null) {
  await fetch(`${MOCK}/__mock/user`, { method: "POST", body: u ? JSON.stringify(u) : "" });
}
export async function mockRequests(): Promise<{ method: string; path: string }[]> {
  return (await fetch(`${MOCK}/__mock/requests`)).json();
}
export async function mockReset() {
  await fetch(`${MOCK}/__mock/reset`, { method: "POST" });
}

/** Signs in through the mock GitHub and waits for the app (or, with expectRefusal, for the error page). */
export async function signIn(page: Page, opts: { expectRefusal?: boolean; as?: { id: number; login: string } } = {}) {
  await mockUser(opts.as ?? null); // null = the allowlisted owner (123658133)
  await page.goto("/signin");
  await page.getByRole("button", { name: "Sign in with GitHub" }).click();
  if (opts.expectRefusal) await page.waitForURL(/\/signin\?error=/);
  else await page.waitForURL(/\/today$/);
}
