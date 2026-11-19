import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { account, auditLog, jobs, session, user } from "../../db/schema/index.ts";
import { closeQueues, enqueueJob } from "../../modules/platform/internal/jobs-repo.ts";
import { fixtureUser, req, testEnv } from "./helpers.ts";

const { db } = testEnv();
const { DELETE } = await import("../../app/api/account/route.ts");
let u: Awaited<ReturnType<typeof fixtureUser>>;
beforeAll(async () => {
  u = await fixtureUser(db, "123658133");
  await enqueueJob(u.id, "diag.echo", { message: "x" });
});
afterAll(async () => { await closeQueues(); });

describe("X-14 account delete makes no GitHub call and shows revoke-by-hand steps", () => {
  it("requires the typed confirmation", async () => {
    const res = await DELETE(req("/api/account", { method: "DELETE", cookie: u.cookie, sameOrigin: true, body: JSON.stringify({ confirm: "yes" }) }));
    expect(res.status).toBe(422);
  });
  it("refuses a cross-origin request", async () => {
    const res = await DELETE(req("/api/account", { method: "DELETE", cookie: u.cookie, headers: { origin: "https://evil.example" }, body: JSON.stringify({ confirm: "DELETE MY ACCOUNT" }) }));
    expect(res.status).toBe(403);
  });
  it("deletes every user row, sends zero requests to GitHub, returns the steps", async () => {
    const realFetch = globalThis.fetch;
    const spy = vi.fn(realFetch);
    globalThis.fetch = spy as typeof fetch;
    try {
      const res = await DELETE(req("/api/account", { method: "DELETE", cookie: u.cookie, sameOrigin: true, body: JSON.stringify({ confirm: "DELETE MY ACCOUNT" }) }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.githubRevoke.steps.length).toBeGreaterThan(2);
      expect(body.githubRevoke.url).toMatch(/^https:\/\/github\.com\//);
      // From the link's sources row (D-37): the 2026-11-19 live check found it behind GitHub sign-in, so "partial".
      expect(body.githubRevoke.verification).toBe("partial");
      expect(body.githubRevoke.stepsNote).toMatch(/steps below are not verified/);
    } finally {
      globalThis.fetch = realFetch;
    }
    const githubCalls = spy.mock.calls.filter(([u]) => /github\.com/.test(String(u instanceof Request ? u.url : u)));
    expect(githubCalls).toEqual([]);
    for (const t of [user, account, session]) expect(await db.select().from(t).where(eq((t as typeof session).userId ?? (t as typeof user).id, u.id))).toEqual([]);
    expect(await db.select().from(jobs).where(eq(jobs.userId, u.id))).toEqual([]);
    const audits = await db.select().from(auditLog).where(eq(auditLog.target, `user:${u.id}`));
    expect(audits.map((x) => [x.action, x.userId])).toEqual([["account.delete", null]]);
  });
});
