import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
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
beforeAll(async () => {
  a = await fixtureUser(db, "123658133");
  b = await fixtureUser(db, "424242");
  jobOfB = await enqueueJob(b.id, "diag.echo", { message: "b's job" });
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
    it(`${r.owned!.method} ${r.file} with A's session on B's ${r.owned!.resource} -> 403`, async () => {
      const mod = await import(/* @vite-ignore */ join(root, r.file));
      const res: Response = await mod[r.owned!.method](req(url(r.file, jobOfB), { method: r.owned!.method, cookie: a.cookie, sameOrigin: true }), { params: Promise.resolve({ id: jobOfB }) });
      expect(res.status).toBe(403);
      expect(await res.text()).not.toContain("b's job");
    });
    it(`${r.owned!.method} ${r.file} with B's own session -> 200`, async () => {
      const mod = await import(/* @vite-ignore */ join(root, r.file));
      const res: Response = await mod[r.owned!.method](req(url(r.file, jobOfB), { method: r.owned!.method, cookie: b.cookie }), { params: Promise.resolve({ id: jobOfB }) });
      expect(res.status).toBe(200);
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
