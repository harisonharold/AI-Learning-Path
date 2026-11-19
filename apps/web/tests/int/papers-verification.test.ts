/** P3-core integration: paper library + FULLTEXT (AT-26), verification results applied to sources (AT-22 storage,
 * AT-23 never-verified, unchanged on temporary failures), the nightly sweep endpoint (HMAC), and the re-check API. */
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { jobs, papers, sources } from "../../db/schema/index.ts";
import { seed } from "../../modules/learning/service.ts";
import { closeQueues } from "../../modules/platform/internal/jobs-repo.ts";
import { signRequest } from "../../modules/platform/internal/hmac.ts";
import { applyJobResult } from "../../modules/research/service.ts";
import { fixtureUser, req, testEnv } from "./helpers.ts";

const { db } = testEnv();
const routes = {
  papers: () => import("../../app/api/papers/route.ts"),
  paper: () => import("../../app/api/papers/[id]/route.ts"),
  verify: () => import("../../app/api/sources/verify/route.ts"),
  sweep: () => import("../../app/api/internal/verify/sweep/route.ts"),
};
const json = (body: unknown, method = "POST") => ({ method, sameOrigin: true, body: JSON.stringify(body), headers: { "content-type": "application/json" } });
const P = (id: number) => ({ params: Promise.resolve({ id: String(id) }) });
let u: Awaited<ReturnType<typeof fixtureUser>>;
const arxivXml = readFileSync(new URL("../../../worker-node/tests/fixtures/arxiv-2309.06180.xml", import.meta.url), "utf8");
// worker-node's real parser, loaded at run time: the web image's type check must not depend on another app's files.
type ParseArxiv = (xml: string, id: string) => Record<string, unknown>;
const parseArxivFeed = async (xml: string, id: string) =>
  ((await import(/* @vite-ignore */ new URL("../../../worker-node/src/verify.ts", import.meta.url).href)) as { parseArxivFeed: ParseArxiv }).parseArxivFeed(xml, id);

async function finishVerify(jobId: string, result: Record<string, unknown>) {
  const job = (await db.select().from(jobs).where(eq(jobs.id, jobId)))[0]!;
  await applyJobResult({ ...job, status: "done", resultJson: result });
}
const search = async (q: string) => (await (await (await routes.papers()).GET(req(`/api/papers?q=${encodeURIComponent(q)}`, { cookie: u.cookie }))).json()).papers as { id: number; title: string }[];

beforeAll(async () => {
  await seed();
  u = await fixtureUser(db, "123658133");
});
afterAll(async () => { await closeQueues(); });

describe("paper library + arXiv verification", () => {
  let paperId = 0;
  let sourceId = 0;
  let jobId = "";
  it("adding an arXiv id stores a placeholder (no invented title) and queues verification", async () => {
    const res = await (await routes.papers()).POST(req("/api/papers", { ...json({ arxivId: "arXiv:2309.06180v1" }), cookie: u.cookie }));
    expect(res.status).toBe(201);
    ({ paperId, sourceId, jobId } = await res.json());
    const p = (await db.select().from(papers).where(eq(papers.id, paperId)))[0]!;
    expect(p.title).toBe("arXiv:2309.06180 (waiting for verification)");
    expect(p.abstract).toBeNull();
    const s = (await db.select().from(sources).where(eq(sources.id, sourceId)))[0]!;
    expect(s).toMatchObject({ kind: "paper", url: "https://arxiv.org/abs/2309.06180", verification: "unverified", externalId: "2309.06180" });
    expect((await db.select().from(jobs).where(eq(jobs.id, jobId)))[0]!.kind).toBe("verify.source");
  });
  it("AT-22: the verification result stores arXiv's title on the source and fills the paper from the API", async () => {
    await finishVerify(jobId, { sourceId, ...(await parseArxivFeed(arxivXml, "2309.06180")) });
    const s = (await db.select().from(sources).where(eq(sources.id, sourceId)))[0]!;
    expect(s.title).toBe("Efficient Memory Management for Large Language Model Serving with PagedAttention");
    expect(s.verification).toBe("verified");
    expect(s.verifiedAt).toBeInstanceOf(Date);
    const p = (await db.select().from(papers).where(eq(papers.id, paperId)))[0]!;
    expect(p.title).toBe(s.title);
    expect(p.abstract).toMatch(/fragmentation/);
    expect((p.authorsJson as string[])[0]).toBe("Woosuk Kwon");
  });
  it("AT-26: FULLTEXT search finds the paper by a keyword in its abstract, and by its notes", async () => {
    expect((await search("fragmentation")).map((p) => p.id)).toContain(paperId);
    expect((await search("zebracorn")).map((p) => p.id)).not.toContain(paperId);
    const patch = await (await routes.paper()).PATCH(req(`/api/papers/${paperId}`, { ...json({ userNotes: "zebracorn: compare with the KV block size study", status: "read" }, "PATCH"), cookie: u.cookie }), P(paperId));
    expect(patch.status).toBe(200);
    expect((await search("zebracorn")).map((p) => p.id)).toContain(paperId);
    expect((await search("KV")).map((p) => p.id)).toContain(paperId); // 2-letter tokens are indexed (innodb_ft_min_token_size=2)
  });
  it("search input with FULLTEXT operators is treated as text, not syntax", async () => {
    for (const q of ['"-+~<>*()@', "frag* -memory", "' OR 1=1 --"]) {
      const r = await (await routes.papers()).GET(req(`/api/papers?q=${encodeURIComponent(q)}`, { cookie: u.cookie }));
      expect(r.status).toBe(200);
    }
  });
  it("adding the same arXiv id again returns the existing entry", async () => {
    const r = await (await routes.papers()).POST(req("/api/papers", { ...json({ arxivId: "2309.06180" }), cookie: u.cookie }));
    expect(await r.json()).toMatchObject({ paperId, duplicate: true });
  });
  it("a non-arXiv id is a field error", async () => {
    const r = await (await routes.papers()).POST(req("/api/papers", { ...json({ arxivId: "not-an-id" }), cookie: u.cookie }));
    expect(r.status).toBe(422);
    expect((await r.json()).error.details.fields[0].path).toBe("arxivId");
  });
});

describe("verification outcomes on stored sources", () => {
  const seeded = async () => (await db.select().from(sources).where(eq(sources.externalId, "content:missing-semester")))[0]!;
  it("AT-23: a captcha outcome is stored as partial, never verified, and a temporary failure keeps the previous status", async () => {
    const s = await seeded();
    const before = s.verification;
    const { jobId } = await (await (await routes.verify()).POST(req("/api/sources/verify", { ...json({ sourceId: s.id }), cookie: u.cookie }))).json();
    await finishVerify(jobId, { sourceId: s.id, verification: "unchanged", method: "HTTP GET + page title (safeFetch)", note: "temporary failure: HTTP 503" });
    expect((await seeded()).verification).toBe(before);
    expect((await seeded()).verifyNote).toMatch(/check inconclusive/);
    const second = await (await (await routes.verify()).POST(req("/api/sources/verify", { ...json({ sourceId: s.id }), cookie: u.cookie }))).json();
    await finishVerify(second.jobId, { sourceId: s.id, verification: "partial", method: "HTTP GET + page title (safeFetch)", note: "HTTP 200: looks like a captcha or access-denied page, so the content could not be checked" });
    expect((await seeded()).verification).toBe("partial");
  });
  it("a broken outcome keeps the last good verified_at and records the block reason", async () => {
    const s = await seeded();
    const { jobId } = await (await (await routes.verify()).POST(req("/api/sources/verify", { ...json({ sourceId: s.id }), cookie: u.cookie }))).json();
    await finishVerify(jobId, { sourceId: s.id, verification: "broken", method: "HTTP GET + page title (safeFetch)", note: "not fetched", blockReason: "dns" });
    const after = await seeded();
    expect(after).toMatchObject({ verification: "broken", fetchBlockReason: "dns" });
    expect(after.verifiedAt?.getTime()).toBe(s.verifiedAt?.getTime());
  });
  it("the re-check API takes only a known source id, never a URL", async () => {
    const route = await routes.verify();
    expect((await route.POST(req("/api/sources/verify", { ...json({ sourceId: 99_999_999 }), cookie: u.cookie }))).status).toBe(404);
    expect((await route.POST(req("/api/sources/verify", { ...json({ url: "http://redis:6379" }), cookie: u.cookie }))).status).toBe(422);
  });
});

describe("nightly sweep endpoint", () => {
  it("refuses unsigned requests", async () => {
    const r = await (await routes.sweep()).POST(req("/api/internal/verify/sweep", { method: "POST", body: "{}" }));
    expect(r.status).toBe(401);
  });
  it("a signed request queues every source not checked in 20 hours", async () => {
    await db.update(sources).set({ lastCheckedAt: new Date(Date.now() - 48 * 3_600_000) });
    const body = "{}";
    const r = await (await routes.sweep()).POST(req("/api/internal/verify/sweep", { method: "POST", body, headers: signRequest(process.env.INTERNAL_HMAC_KEY!, "POST", "/api/internal/verify/sweep", body) }));
    expect(r.status).toBe(200);
    const { enqueued } = await r.json() as { enqueued: number };
    const total = (await db.select({ id: sources.id }).from(sources)).length;
    expect(enqueued).toBe(total);
    const queued = await db.select().from(jobs).where(eq(jobs.kind, "verify.source"));
    expect(queued.filter((j) => j.userId === null).length).toBeGreaterThanOrEqual(total);
  });
});
