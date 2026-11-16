import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { jobs } from "../../db/schema/index.ts";
import { signRequest } from "../../modules/platform/internal/hmac.ts";
import { closeQueues, enqueueJob } from "../../modules/platform/internal/jobs-repo.ts";
import { fixtureUser, req, testEnv } from "./helpers.ts";

const { db, redis } = testEnv();
const KEY = process.env.INTERNAL_HMAC_KEY!;
const { POST: callback } = await import("../../app/api/internal/jobs/[id]/result/route.ts");
const { POST: createJob } = await import("../../app/api/jobs/route.ts");

let userCookie = "";
let userId = "";
beforeAll(async () => ({ id: userId, cookie: userCookie } = await fixtureUser(db, "123658133")));
afterAll(async () => { await closeQueues(); });

function signed(id: string, body: object, opts: { now?: number; key?: string } = {}) {
  const path = `/api/internal/jobs/${id}/result`;
  const raw = JSON.stringify(body);
  const headers = { "content-type": "application/json", ...signRequest(opts.key ?? KEY, "POST", path, raw, opts.now) };
  return { request: () => req(path, { method: "POST", body: raw, headers }), params: { params: Promise.resolve({ id }) } };
}

describe("AT-05 (web side): job enqueue + HMAC callback", () => {
  it("POST /api/jobs creates the jobs row and a BullMQ job on the Python queue", async () => {
    const res = await createJob(req("/api/jobs", { method: "POST", cookie: userCookie, sameOrigin: true, body: JSON.stringify({ kind: "diag.echo", input: { message: "hi" } }), headers: { "content-type": "application/json" } }));
    expect(res.status).toBe(202);
    const { id } = await res.json();
    expect((await db.select().from(jobs).where(eq(jobs.id, id)))[0]!.status).toBe("queued");
    expect(await redis.exists(`bull:atlas-py:${id}`)).toBe(1);
  });

  it("rejects unknown job kinds with 422", async () => {
    const res = await createJob(req("/api/jobs", { method: "POST", cookie: userCookie, sameOrigin: true, body: JSON.stringify({ kind: "shell.exec", input: {} }) }));
    expect(res.status).toBe(422);
  });

  it("rejects a cross-origin POST /api/jobs (CSRF)", async () => {
    const r = req("/api/jobs", { method: "POST", cookie: userCookie, body: JSON.stringify({ kind: "diag.echo", input: { message: "x" } }), headers: { origin: "https://evil.example" } });
    expect((await createJob(r)).status).toBe(403);
  });

  it("valid signed callback completes the job exactly once", async () => {
    const id = await enqueueJob(userId, "diag.echo", { message: "x" });
    const c = signed(id, { status: "done", result: { echo: "x" }, attempts: 1 });
    const res = await callback(c.request(), c.params);
    expect(res.status).toBe(200);
    const row = (await db.select().from(jobs).where(eq(jobs.id, id)))[0]!;
    expect(row.status).toBe("done");
    expect(row.resultJson).toEqual({ echo: "x" });
    const again = signed(id, { status: "failed", error: "late", attempts: 2 });
    expect((await callback(again.request(), again.params)).status).toBe(409);
  });

  it("bad signature -> 401 and the job is untouched", async () => {
    const id = await enqueueJob(userId, "diag.echo", { message: "x" });
    const c = signed(id, { status: "done", attempts: 1 }, { key: "wrong-key-0123456789abcdef0123456789" });
    const res = await callback(c.request(), c.params);
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe("BAD_SIGNATURE");
    expect((await db.select().from(jobs).where(eq(jobs.id, id)))[0]!.status).toBe("queued");
  });

  it("timestamp older than 5 minutes -> 401", async () => {
    const id = await enqueueJob(userId, "diag.echo", { message: "x" });
    const c = signed(id, { status: "done", attempts: 1 }, { now: Date.now() - 301_000 });
    const res = await callback(c.request(), c.params);
    expect(res.status).toBe(401);
    expect((await res.json()).error.details.reason).toBe("stale");
  });

  it("replayed nonce -> 401 (Redis SET NX)", async () => {
    const id = await enqueueJob(userId, "diag.echo", { message: "x" });
    const c = signed(id, { status: "done", attempts: 1 });
    const replay = c.request();
    expect((await callback(c.request(), c.params)).status).toBe(200);
    const res = await callback(replay, c.params);
    expect(res.status).toBe(401);
    expect((await res.json()).error.details.reason).toBe("replayed");
  });

  it("nonce TTL is 600 s", async () => {
    const id = await enqueueJob(userId, "diag.echo", { message: "x" });
    const c = signed(id, { status: "done", attempts: 1 });
    const r = c.request();
    await callback(r, c.params);
    const ttl = await redis.ttl(`hmac:nonce:${r.headers.get("x-atlas-nonce")}`);
    expect(ttl).toBeGreaterThan(590);
    expect(ttl).toBeLessThanOrEqual(600);
  });

  it("invalid body shape (after valid signature) -> 422", async () => {
    const id = await enqueueJob(userId, "diag.echo", { message: "x" });
    const c = signed(id, { status: "ok", attempts: 1, userId: "someone" });
    expect((await callback(c.request(), c.params)).status).toBe(422);
  });
});
