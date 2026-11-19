import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { attempts, cards, papers, projectReports, projects, runConfigs, runs, sources } from "../../db/schema/index.ts";
import { createRunnerToken } from "../../modules/platform/internal/runner-tokens.ts";
import { addLessonCards, seed } from "../../modules/learning/service.ts";
import { closeQueues, enqueueJob } from "../../modules/platform/internal/jobs-repo.ts";
import { ROUTES } from "../../modules/platform/route-manifest.ts";
import { fixtureUser, req, testEnv } from "./helpers.ts";

const { db } = testEnv();
const root = fileURLToPath(new URL("../../", import.meta.url));

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? routeFiles(p) : f === "route.ts" ? [relative(root, p)] : [];
  });
}

let a: Awaited<ReturnType<typeof fixtureUser>>;
let b: Awaited<ReturnType<typeof fixtureUser>>;
let jobOfB = "";
const ownedOfB: Record<string, string> = {};
beforeAll(async () => {
  await seed();
  a = await fixtureUser(db, "123658133");
  b = await fixtureUser(db, "424242");
  jobOfB = await enqueueJob(b.id, "diag.echo", { message: "b's job" });
  ownedOfB.job = jobOfB;
  await addLessonCards(b.id, "w01-tooling");
  ownedOfB.card = String((await db.select({ id: cards.id }).from(cards).where(eq(cards.userId, b.id)).limit(1))[0]!.id);
  const [att] = await db.insert(attempts).values({ userId: b.id, gateId: "g-w02", source: "manual", status: "pending_evidence", contentVersion: "t" }).$returningId();
  ownedOfB.attempt = String(att!.id);
  const [proj] = await db.insert(projects).values({ userId: b.id, title: "b's project" }).$returningId();
  ownedOfB.project = String(proj!.id);
  const [cfg] = await db.insert(runConfigs).values({ projectId: proj!.id, name: "c", configJson: {}, configHash: "0".repeat(64) }).$returningId();
  const [run] = await db.insert(runs).values({ projectId: proj!.id, configId: cfg!.id, envJson: {}, envFingerprint: "0".repeat(64), status: "ok", source: "upload" }).$returningId();
  ownedOfB.run = String(run!.id);
  const [rep] = await db.insert(projectReports).values({ projectId: proj!.id, userId: b.id, jobId: "00000000-0000-0000-0000-00000000000b", status: "done", markdown: "# b's job", html: "<p>b</p>", runIds: [run!.id] }).$returningId();
  ownedOfB.report = String(rep!.id);
  ownedOfB.runner_token = String((await createRunnerToken(b.id, ["results:write"], 30)).id);
  const src = (await db.select({ id: sources.id }).from(sources).limit(1))[0]!;
  const [pap] = await db.insert(papers).values({ userId: b.id, sourceId: src.id, title: "b's job paper" }).$returningId();
  ownedOfB.paper = String(pap!.id);
});
afterAll(async () => { await closeQueues(); });

describe("AT-04 route manifest", () => {
  it("lists every app/api route file", () => {
    expect(routeFiles(join(root, "app/api")).sort()).toEqual(ROUTES.map((r) => r.file).sort());
  });
});

const sessionRoutes = ROUTES.filter((r) => r.auth === "session");
const url = (file: string, id = "00000000-0000-0000-0000-000000000000") => "/" + file.replace(/^app\//, "").replace(/\/route\.ts$/, "").replace(/\[id\]/, id);

describe("AT-04 every session route refuses anonymous callers", () => {
  for (const r of sessionRoutes) {
    for (const m of r.methods) {
      it(`${m} ${r.file} -> 401 or 403 without a session`, async () => {
        const mod = await import(/* @vite-ignore */ join(root, r.file));
        const res: Response = await mod[m](req(url(r.file), { method: m, sameOrigin: true, body: m === "GET" ? undefined : "{}" }), { params: Promise.resolve({ id: jobOfB }) });
        expect([401, 403]).toContain(res.status);
      });
    }
  }
});

describe("AT-04 user A cannot read user B's resources", () => {
  for (const r of ROUTES.filter((x) => x.owned)) {
    const o = r.owned!;
    const call = async (cookie: string) => {
      const id = ownedOfB[o.resource]!;
      const mod = await import(/* @vite-ignore */ join(root, r.file));
      const init = { method: o.method, cookie, sameOrigin: true, ...(o.body ? { body: JSON.stringify(o.body), headers: { "content-type": "application/json" } } : {}) };
      return (await mod[o.method](req(url(r.file, id), init), { params: Promise.resolve({ id }) })) as Response;
    };
    it(`${o.method} ${r.file} with A's session on B's ${o.resource} -> 403`, async () => {
      const res = await call(a.cookie);
      expect(res.status).toBe(403);
      expect(await res.text()).not.toContain("b's job");
    });
    it(`${o.method} ${r.file} with B's own session -> 2xx`, async () => {
      expect((await call(b.cookie)).status).toBeLessThan(300);
    });
  }
  it("GET /api/jobs lists only the caller's jobs", async () => {
    const { GET } = await import("../../app/api/jobs/route.ts");
    const body = await (await GET(req("/api/jobs", { cookie: a.cookie }))).json();
    expect(body.items.map((j: { id: string }) => j.id)).not.toContain(jobOfB);
  });
  it("GET /api/me returns the caller, not anyone else", async () => {
    const { GET } = await import("../../app/api/me/route.ts");
    expect((await (await GET(req("/api/me", { cookie: a.cookie }))).json()).user.id).toBe(a.id);
  });
});
