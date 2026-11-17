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

export const userId = () => sql("SELECT id FROM `user` LIMIT 1")[0]!;

/**
 * Stands in for atlas-lab (P2): marks a gate passed with a verified runner result, written straight to the DB.
 * Used only to reach states (week 2+, due cards) that P1 cannot produce from the browser by design.
 */
export function passGateFixture(gateId: string, ref: string) {
  const u = userId();
  sql(`INSERT INTO attempts (user_id, gate_id, source, status, passed, content_version) VALUES ('${u}', '${gateId}', 'runner', 'passed', 1, 'e2e')`);
  const id = sql(`SELECT MAX(id) FROM attempts WHERE user_id='${u}' AND gate_id='${gateId}'`)[0];
  sql(`INSERT INTO attempt_evidence (attempt_id, kind, passed, ref, verified, verify_method) VALUES (${id}, 'runner_result', 1, '${ref}', 1, 'e2e fixture standing in for atlas-lab')`);
}
export function resetLearning() {
  const u = userId();
  for (const t of ["card_reviews", "cards", "remediation_plans", "time_logs", "diagnostic_sessions"]) sql(`DELETE FROM ${t} WHERE user_id='${u}'`);
  sql(`DELETE FROM attempts WHERE user_id='${u}'`);
}
