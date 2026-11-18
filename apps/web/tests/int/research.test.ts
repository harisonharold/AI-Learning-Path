/** P2 lab integration: AT-15, AT-16, AT-18, AT-19, AT-20, AT-21 (web part), AT-47 (API part), runner gate results, X-06. */
import { readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { jobs, projects, runMetrics, runnerTokens, runs } from "../../db/schema/index.ts";
import { gate, seed } from "../../modules/learning/service.ts";
import { closeQueues } from "../../modules/platform/internal/jobs-repo.ts";
import { verifyRequest } from "../../modules/platform/internal/hmac.ts";
import { configHash, sha256 } from "../../modules/research/internal/contract.ts";
import { describe as summarize } from "../../modules/research/internal/summary.ts";
import { applyJobResult, setSampleData } from "../../modules/research/service.ts";
import { fixtureUser, req, testEnv } from "./helpers.ts";

const { db } = testEnv();
const C = new URL("../../../../packages/contracts/fixtures/", import.meta.url);
const fixture = (n: string) => JSON.parse(readFileSync(new URL(n, C), "utf8"));

const routes = {
  projects: () => import("../../app/api/projects/route.ts"),
  project: () => import("../../app/api/projects/[id]/route.ts"),
  runs: () => import("../../app/api/projects/[id]/runs/route.ts"),
  report: () => import("../../app/api/projects/[id]/report/route.ts"),
  compare: () => import("../../app/api/runs/compare/route.ts"),
  run: () => import("../../app/api/runs/[id]/route.ts"),
  tokens: () => import("../../app/api/runner/tokens/route.ts"),
  token: () => import("../../app/api/runner/tokens/[id]/route.ts"),
  results: () => import("../../app/api/runner/results/route.ts"),
  bundle: () => import("../../app/api/runner/bundle/route.ts"),
  settings: () => import("../../app/api/settings/route.ts"),
};
const P = (id: number | string) => ({ params: Promise.resolve({ id: String(id) }) });
const json = (body: unknown) => ({ method: "POST", sameOrigin: true, body: JSON.stringify(body), headers: { "content-type": "application/json" } });

let u: Awaited<ReturnType<typeof fixtureUser>>;
const PREREG = { primary_metric: "latency_ms", baseline_desc: "batch=1", stopping_rule: "5 ok runs per config", min_repetitions: 3 };

async function newProject(prereg = true) {
  const r = await (await routes.projects()).POST(req("/api/projects", { ...json({ title: "Batching study", hypothesis: "Batching lowers p50" }), cookie: u.cookie }));
  const { id } = await r.json() as { id: number };
  if (prereg) await (await routes.project()).PATCH(req(`/api/projects/${id}`, { ...json({ prereg: PREREG }), method: "PATCH", cookie: u.cookie }), P(id));
  return id;
}

let seq = 0;
function upload(projectId: number, over: Record<string, unknown> = {}) {
  const base = fixture("benchmark.valid.json");
  const config = (over.config as Record<string, unknown>) ?? base.config;
  // Each upload differs (started_at) so the idempotency check doesn't treat them as the same bytes.
  return { ...base, project_id: projectId, started_at: `2026-11-18T10:${String(seq++ % 60).padStart(2, "0")}:00Z`, ended_at: "2026-11-18T11:00:00Z", ...over, config, config_hash: configHash(config) };
}

async function postRun(projectId: number, body: unknown) {
  return (await routes.runs()).POST(req(`/api/projects/${projectId}/runs`, { ...json(body), cookie: u.cookie }), P(projectId));
}

beforeAll(async () => {
  await seed();
  u = await fixtureUser(db, "123658133");
});
afterAll(async () => { await closeQueues(); });

describe("AT-15: the server recomputes summaries from samples", () => {
  it("stores a run with server p50/p95/p99 and ignores the conflicting client summary", async () => {
    const pid = await newProject();
    const body = upload(pid);
    const res = await postRun(pid, body);
    expect(res.status).toBe(201);
    const out = await res.json() as { runId: number; summaries: Record<string, { p50: number; p95: number; p99: number }> };
    const expected = summarize(body.metrics[0].samples);
    expect(out.summaries.latency_ms).toMatchObject({ p50: expected.p50, p95: expected.p95, p99: expected.p99 });
    const m = (await db.select().from(runMetrics).where(eq(runMetrics.runId, out.runId)))[0]!;
    expect((m.summaryJson as { p50: number }).p50).toBe(expected.p50);
    expect((m.clientSummaryJson as { p50: number }).p50).toBe(1); // kept for audit only
    expect((m.summaryJson as { p50: number }).p50).not.toBe(1);
    const job = (await db.select().from(jobs).where(eq(jobs.kind, "stats.summarize"))).find((j) => (j.payloadJson as { run_id: number }).run_id === out.runId);
    expect(job, "a stats job adds bootstrap CIs").toBeTruthy();
    expect(JSON.stringify(job!.payloadJson)).not.toContain("12.1"); // the jobs row keeps a slim payload, not the samples
  });
  it("the same bytes uploaded twice return the same run", async () => {
    const pid = await newProject();
    const body = upload(pid);
    const a = await (await postRun(pid, body)).json() as { runId: number };
    const b = await (await postRun(pid, body)).json() as { runId: number; duplicate: boolean };
    expect(b).toMatchObject({ runId: a.runId, duplicate: true });
  });
  it("the stats job result merges CIs into the stored summary", async () => {
    const pid = await newProject();
    const { runId } = await (await postRun(pid, upload(pid))).json() as { runId: number };
    const job = (await db.select().from(jobs).where(eq(jobs.kind, "stats.summarize"))).find((j) => (j.payloadJson as { run_id: number }).run_id === runId)!;
    await applyJobResult({ ...job, status: "done", resultJson: { run_id: runId, metrics: { latency_ms: { ci95: { p50: [11, 13] }, method: "percentile bootstrap", resamples: 2000, seed: 1, basis_n: 10, histogram: { edges: [], counts: [] }, cdf: [] } } } });
    const m = (await db.select().from(runMetrics).where(eq(runMetrics.runId, runId)))[0]!;
    expect(m.summaryJson).toMatchObject({ ci_status: "done", ci95: { p50: [11, 13] }, p50: summarize(upload(pid).metrics[0].samples).p50 });
  });
});

describe("AT-16: invalid uploads get 422 with per-field errors", () => {
  it("lists every bad field", async () => {
    const pid = await newProject();
    const res = await postRun(pid, { ...fixture("benchmark.invalid.json").body, project_id: pid });
    expect(res.status).toBe(422);
    const paths = (await res.json()).error.details.fields.map((f: { path: string }) => f.path);
    for (const p of ["schema_version", "config_hash", "env.git_sha", "metrics.0.name", "metrics.0.samples"]) expect(paths).toContain(p);
  });
  it("a config_hash that doesn't match the config is a field error", async () => {
    const pid = await newProject();
    const res = await postRun(pid, { ...upload(pid), config_hash: "f".repeat(64) });
    expect(res.status).toBe(422);
    expect((await res.json()).error.details.fields[0].path).toBe("config_hash");
  });
  it("non-JSON is 422 and an oversized body is 413", async () => {
    const pid = await newProject();
    const bad = await (await routes.runs()).POST(req(`/api/projects/${pid}/runs`, { method: "POST", sameOrigin: true, body: "{not json", cookie: u.cookie }), P(pid));
    expect(bad.status).toBe(422);
    const big = await (await routes.runs()).POST(req(`/api/projects/${pid}/runs`, { method: "POST", sameOrigin: true, body: "x".repeat(21 * 1024 * 1024), cookie: u.cookie }), P(pid));
    expect(big.status).toBe(413);
  });
});

describe("F.5 pre-registration", () => {
  it("uploads are refused until the project is pre-registered", async () => {
    const pid = await newProject(false);
    const res = await postRun(pid, upload(pid));
    expect(res.status).toBe(409);
    expect((await res.json()).error.message).toMatch(/Pre-register/);
  });
  it("the pre-registration and hypothesis are fixed once saved; amendments are appended with a timestamp", async () => {
    const pid = await newProject();
    const route = await routes.project();
    const change = await route.PATCH(req(`/api/projects/${pid}`, { ...json({ prereg: { ...PREREG, min_repetitions: 2 } }), method: "PATCH", cookie: u.cookie }), P(pid));
    expect(change.status).toBe(409);
    const hyp = await route.PATCH(req(`/api/projects/${pid}`, { ...json({ hypothesis: "new" }), method: "PATCH", cookie: u.cookie }), P(pid));
    expect(hyp.status).toBe(409);
    const am = await route.PATCH(req(`/api/projects/${pid}`, { ...json({ amendment: "Added a warm-up run per config." }), method: "PATCH", cookie: u.cookie }), P(pid));
    expect(am.status).toBe(200);
    const p = await am.json() as { amendments: string[]; prereg: { min_repetitions: number } };
    expect(p.amendments[0]).toMatch(/^\d{4}-\d{2}-\d{2}T.*: Added a warm-up run per config\.$/);
    expect(p.prereg.min_repetitions).toBe(3);
  });
});

describe("AT-18: runner tokens", () => {
  async function token(scopes: string[] = ["results:write", "tests:read"], days = 30) {
    const r = await (await routes.tokens()).POST(req("/api/runner/tokens", { ...json({ scopes, days }), cookie: u.cookie }));
    expect(r.status).toBe(201);
    return await r.json() as { id: number; token: string };
  }
  const runnerPost = async (tok: string | null, body: unknown, extra: Record<string, string> = {}) =>
    (await routes.results()).POST(req("/api/runner/results", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json", ...(tok ? { authorization: `Bearer ${tok}` } : {}), ...extra } }));

  it("a results:write token can upload a benchmark run", async () => {
    const t = await token();
    const pid = await newProject();
    const res = await runnerPost(t.token, { kind: "benchmark", ...upload(pid) });
    expect(res.status).toBe(201);
    const { runId } = await res.json() as { runId: number };
    const row = (await db.select().from(runs).where(eq(runs.id, runId)))[0]!;
    expect(row).toMatchObject({ source: "runner", runnerTokenId: t.id });
  });
  it("the token is stored only as a SHA-256 hash, with a display prefix", async () => {
    const t = await token();
    const row = (await db.select().from(runnerTokens).where(eq(runnerTokens.id, t.id)))[0]!;
    expect(row.tokenHash).toBe(sha256(t.token));
    expect(JSON.stringify(row)).not.toContain(t.token);
    expect(row.tokenPrefix).toBe(t.token.slice(0, 8));
    const list = await (await (await routes.tokens()).GET(req("/api/runner/tokens", { cookie: u.cookie }))).text();
    expect(list).not.toContain(t.token);
    expect(list).not.toContain(row.tokenHash);
  });
  it("revoked and expired tokens get 401; a missing scope gets 403", async () => {
    const pid = await newProject();
    const revoked = await token();
    const del = await (await routes.token()).DELETE(req(`/api/runner/tokens/${revoked.id}`, { method: "DELETE", sameOrigin: true, cookie: u.cookie }), P(revoked.id));
    expect(del.status).toBe(200);
    expect((await runnerPost(revoked.token, { kind: "benchmark", ...upload(pid) })).status).toBe(401);
    const expired = await token();
    await db.update(runnerTokens).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(runnerTokens.id, expired.id));
    expect((await runnerPost(expired.token, { kind: "benchmark", ...upload(pid) })).status).toBe(401);
    const readOnly = await token(["tests:read"]);
    expect((await runnerPost(readOnly.token, { kind: "benchmark", ...upload(pid) })).status).toBe(403);
  });
  it("a session cookie alone never authenticates a runner route (no CSRF surface)", async () => {
    const pid = await newProject();
    expect((await runnerPost(null, { kind: "benchmark", ...upload(pid) }, { cookie: u.cookie })).status).toBe(401);
    expect((await (await routes.bundle()).GET(req("/api/runner/bundle?ref=atlas-lab:w01@1", { cookie: u.cookie }))).status).toBe(401);
  });
  it("tokens are limited to 90 days", async () => {
    expect((await (await routes.tokens()).POST(req("/api/runner/tokens", { ...json({ scopes: ["results:write"], days: 91 }), cookie: u.cookie }))).status).toBe(422);
  });

  describe("gate test runs produce runner_result evidence (counting, D-15)", () => {
    it("X-06: the bundle needs a tests:read token and carries the hidden tests", async () => {
      const t = await token();
      const res = await (await routes.bundle()).GET(req("/api/runner/bundle?ref=atlas-lab:w01@1", { headers: { authorization: `Bearer ${t.token}` } }));
      expect(res.status).toBe(200);
      const b = await res.json() as { sha256: string; manifest: { tests: string[]; image: string }; files: Record<string, string> };
      expect(b.manifest.image).toMatch(/@sha256:[0-9a-f]{64}$/);
      expect(b.files["test_hidden.py"]).toContain("atlas-gate-canary-w01");
    });
    it("a stale bundle hash or a different test list is refused; a full pass records passing evidence", async () => {
      const t = await token();
      const b = await (await (await routes.bundle()).GET(req("/api/runner/bundle?ref=atlas-lab:w01@1", { headers: { authorization: `Bearer ${t.token}` } }))).json() as { sha256: string; manifest: { tests: string[] } };
      const base = { ...fixture("gate-result.valid.json"), kind: "gate_tests", bundle: "atlas-lab:w01@1", bundle_sha256: b.sha256,
        results: b.manifest.tests.map((test) => ({ test, passed: true, duration_ms: 1 })) };
      expect((await runnerPost(t.token, { ...base, bundle_sha256: "0".repeat(64) })).status).toBe(422);
      expect((await runnerPost(t.token, { ...base, results: base.results.slice(1) })).status).toBe(422);
      const ok = await runnerPost(t.token, base);
      expect(ok.status).toBe(201);
      expect(await ok.json()).toMatchObject({ gateId: "g-w01", passed: true, passedCount: b.manifest.tests.length });
      const g = await gate(u.id, "g-w01");
      // The quiz half of the gate is still missing, so the gate is pending, not passed.
      expect(g.status).toBe("pending_evidence");
      expect(JSON.stringify(g)).toContain("runner_result");
    });
  });
});

describe("AT-19: report generation needs a baseline and enough repetitions", () => {
  it("409 with reasons, then 202 once the rule holds; failed runs go into the report payload", async () => {
    const pid = await newProject();
    const route = await routes.report();
    const call = () => route.POST(req(`/api/projects/${pid}/report`, { method: "POST", sameOrigin: true, cookie: u.cookie }), P(pid));
    let res = await call();
    expect(res.status).toBe(409);
    expect((await res.json()).error.details.reasons.join(" ")).toMatch(/No baseline run yet/);
    for (let i = 0; i < 3; i++) await postRun(pid, upload(pid, { config: { batch_size: 1 }, config_name: "batch=1", is_baseline: true }));
    res = await call();
    expect(res.status).toBe(409);
    expect((await res.json()).error.details.reasons.join(" ")).toMatch(/No other config has 3/);
    for (let i = 0; i < 2; i++) await postRun(pid, upload(pid, { config: { batch_size: 8 }, config_name: "batch=8" }));
    await postRun(pid, upload(pid, { config: { batch_size: 8 }, config_name: "batch=8", is_warmup: true })); // warm-ups don't count
    expect((await call()).status).toBe(409);
    await postRun(pid, upload(pid, { config: { batch_size: 8 }, config_name: "batch=8", status: "failed", failure_note: "OOM", metrics: [] }));
    await postRun(pid, upload(pid, { config: { batch_size: 8 }, config_name: "batch=8" }));
    res = await call();
    expect(res.status).toBe(202);
    const { jobId } = await res.json() as { jobId: string };
    const job = (await db.select().from(jobs).where(eq(jobs.id, jobId)))[0]!;
    expect(job.kind).toBe("report.render");
    const pr = await (await (await routes.project()).GET(req(`/api/projects/${pid}`, { cookie: u.cookie }), P(pid))).json() as { readiness: { ready: boolean }; runs: { status: string }[] };
    expect(pr.readiness.ready).toBe(true);
    expect(pr.runs.some((r) => r.status === "failed")).toBe(true);
    expect((job.payloadJson as { run_ids: number[] }).run_ids.length).toBe(pr.runs.length);
  });
});

describe("AT-20: sample data is labelled and excluded", () => {
  it("is off by default, appears only when enabled, is never reportable, and leaves the meters unchanged", async () => {
    const meters = async () => (await (await import("../../app/api/analytics/meters/route.ts")).GET(req("/api/analytics/meters", { cookie: u.cookie }))).json();
    const before = await meters();
    const list = async () => (await (await (await routes.projects()).GET(req("/api/projects", { cookie: u.cookie }))).json()).projects as { id: number; isMock: boolean }[];
    expect((await list()).some((p) => p.isMock)).toBe(false);
    const put = await (await routes.settings()).PUT(req("/api/settings", { ...json({ sampleData: true }), method: "PUT", cookie: u.cookie }));
    expect(put.status).toBe(200);
    const mock = (await list()).find((p) => p.isMock)!;
    expect(mock).toBeTruthy();
    const mockRuns = await db.select().from(runs).where(eq(runs.projectId, mock.id));
    expect(mockRuns.length).toBe(12);
    expect(mockRuns.every((r) => r.isMock)).toBe(true);
    const rep = await (await routes.report()).POST(req(`/api/projects/${mock.id}/report`, { method: "POST", sameOrigin: true, cookie: u.cookie }), P(mock.id));
    expect(rep.status).toBe(409);
    expect((await rep.json()).error.details.reasons.join(" ")).toMatch(/sample data never goes into reports/);
    expect(await meters()).toEqual(before);
    await setSampleData(u.id, false);
    expect((await db.select().from(projects).where(and(eq(projects.userId, u.id), eq(projects.isMock, true)))).length).toBe(0);
  });
});

describe("AT-21 (web part) and AT-47: compare goes through api-py and degrades without it", () => {
  let server: Server;
  let seen = 0;
  beforeAll(async () => {
    const f = fixture("stats-compare.fixture.json");
    server = createServer((rq, rs) => {
      let body = "";
      rq.on("data", (c) => { body += c; });
      rq.on("end", async () => {
        const v = await verifyRequest(process.env.INTERNAL_HMAC_KEY!, { claim: async () => true }, { method: "POST", path: rq.url!, headers: (n) => (rq.headers[n] as string) ?? null, body });
        seen++;
        rs.writeHead(v.ok ? 200 : 401, { "content-type": "application/json" });
        rs.end(JSON.stringify(v.ok ? f.expected : { error: "bad signature" }));
      });
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  });
  afterAll(() => { server.close(); });

  async function twoRuns() {
    const pid = await newProject();
    const a = await (await postRun(pid, upload(pid, { config: { batch_size: 1 }, config_name: "batch=1", is_baseline: true }))).json() as { runId: number };
    const b = await (await postRun(pid, upload(pid, { config: { batch_size: 8 }, config_name: "batch=8" }))).json() as { runId: number };
    return [a.runId, b.runId];
  }
  it("signs the call and returns api-py's bootstrap result (fixed-seed fixture)", async () => {
    const addr = server.address() as { port: number };
    process.env.API_PY_URL = `http://127.0.0.1:${addr.port}`;
    const { resetEnvForTests } = await import("../../modules/platform/internal/env.ts");
    resetEnvForTests();
    const [a, b] = await twoRuns();
    const res = await (await routes.compare()).GET(req(`/api/runs/compare?ids=${a},${b}&metric=latency_ms`, { cookie: u.cookie }));
    const out = await res.json() as { degraded: boolean; comparisons: { stats: { diff: { p50: { ci95: number[] } } }; sameEnv: boolean; configDiff: { field: string }[] }[] };
    expect(seen).toBeGreaterThan(0);
    expect(out.degraded).toBe(false);
    expect(out.comparisons[0]!.stats.diff.p50.ci95).toEqual(fixture("stats-compare.fixture.json").expected.diff.p50.ci95);
    expect(out.comparisons[0]!.sameEnv).toBe(true);
    expect(out.comparisons[0]!.configDiff.map((d) => d.field)).toEqual(["batch_size"]);
  });
  it("with api-py down, returns stored summaries and degraded: true", async () => {
    process.env.API_PY_URL = "http://127.0.0.1:9";
    const { resetEnvForTests } = await import("../../modules/platform/internal/env.ts");
    resetEnvForTests();
    const [a, b] = await twoRuns();
    const res = await (await routes.compare()).GET(req(`/api/runs/compare?ids=${a},${b}&metric=latency_ms`, { cookie: u.cookie }));
    expect(res.status).toBe(200);
    const out = await res.json() as { degraded: boolean; runs: { summary: { p50: number } }[]; comparisons: { stats: unknown }[] };
    expect(out.degraded).toBe(true);
    expect(out.runs[0]!.summary.p50).toBe(summarize(upload(0).metrics[0].samples).p50);
    expect(out.comparisons[0]!.stats).toBeNull();
  });
});
