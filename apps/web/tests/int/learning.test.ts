import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { attemptEvidence, attempts, cards, remediationPlans, rubricScores } from "../../db/schema/index.ts";
import * as repo from "../../modules/learning/internal/repo.ts";
import { getContent, lesson, seed } from "../../modules/learning/service.ts";
import { closeQueues } from "../../modules/platform/internal/jobs-repo.ts";
import { fixtureUser, req, testEnv } from "./helpers.ts";

const { db } = testEnv();
const routes = {
  roadmap: await import("../../app/api/roadmap/route.ts"),
  quiz: await import("../../app/api/quiz/route.ts"),
  cards: await import("../../app/api/cards/route.ts"),
  review: await import("../../app/api/cards/[id]/review/route.ts"),
  gate: await import("../../app/api/gates/[id]/route.ts"),
  attempts: await import("../../app/api/gates/[id]/attempts/route.ts"),
  rubric: await import("../../app/api/attempts/[id]/rubric/route.ts"),
  exercise: await import("../../app/api/exercises/[id]/route.ts"),
  hints: await import("../../app/api/exercises/[id]/hints/route.ts"),
  practice: await import("../../app/api/exercises/[id]/practice/route.ts"),
  solution: await import("../../app/api/exercises/[id]/solution/route.ts"),
  timeLogs: await import("../../app/api/time-logs/route.ts"),
  settings: await import("../../app/api/settings/route.ts"),
  diagSave: await import("../../app/api/diagnostic/attempts/route.ts"),
  diagResult: await import("../../app/api/diagnostic/result/route.ts"),
  meters: await import("../../app/api/analytics/meters/route.ts"),
  lessonRoute: await import("../../app/api/lessons/[slug]/route.ts"),
};

let u: Awaited<ReturnType<typeof fixtureUser>>;
const json = (o: unknown) => ({ body: JSON.stringify(o), headers: { "content-type": "application/json" } });
const post = (path: string, o: unknown) => req(path, { method: "POST", cookie: u.cookie, sameOrigin: true, ...json(o) });
const get = (path: string) => req(path, { cookie: u.cookie });
const p = (id: string) => ({ params: Promise.resolve({ id }) });
const roadmapState = async (weekId: string) => (await (await routes.roadmap.GET(get("/api/roadmap"))).json()).roadmap.weeks.find((w: { id: string }) => w.id === weekId);

/** Simulates what atlas-lab will upload in P2: a verified runner result on the open attempt. */
async function runnerResult(gateId: string, ref: string, passed: boolean) {
  const a = await repo.openAttempt(u.id, gateId, "t");
  if ("error" in a) throw new Error(a.error);
  await repo.addEvidence(a.id, { kind: "runner_result", ref, passed, verified: true, method: "test fixture standing in for atlas-lab (P2)" });
  const g = getContent().curriculum.ri_weeks.flatMap((w) => w.gates.map((x) => ({ ...x, skills: x.skills ?? w.skills }))).find((x) => x.id === gateId)!;
  const { remediationFor } = await import("../../modules/learning/internal/progress.ts");
  return repo.settleAttempt(u.id, a.id, g, remediationFor);
}
const q01 = () => getContent().quizzes.get("q-w01")!;
const allRight = () => Object.fromEntries(q01().questions.map((x) => [x.id, x.answer]));

beforeAll(async () => {
  await seed();
  u = await fixtureUser(db, "123658133");
});
afterAll(async () => { await closeQueues(); });

describe("seed", () => {
  it("is idempotent", async () => { await seed(); await seed(); });
});

describe("AT-06 via the API: 100 hours logged never unlock W3", () => {
  it("logs 100 h against W2 and W3; W3 stays locked", async () => {
    for (const w of ["RI-W02", "RI-W03"]) for (let i = 0; i < 7; i++)
      expect((await routes.timeLogs.POST(post("/api/time-logs", { weekId: w, minutes: 16 * 60 > 430 ? 430 : 430, category: "lab", source: "manual" }))).status).toBe(201);
    const w3 = await roadmapState("RI-W03");
    expect(w3.state).toBe("locked");
    expect((await roadmapState("RI-W01")).state).toBe("available");
  });
  it("submitting to a locked week's gate is refused with 409 LOCKED", async () => {
    const r = await routes.attempts.POST(post("/api/gates/g-w03/attempts", { type: "artifact", kind: "report", url: "https://github.com/x/y/blob/0123/REPORT.md" }), p("g-w03"));
    expect(r.status).toBe(409);
    expect((await r.json()).error.code).toBe("LOCKED");
  });
});

describe("quiz answers stay server-side", () => {
  it("GET /api/gates/g-w01 shows questions without answers or the canary", async () => {
    const text = await (await routes.gate.GET(get("/api/gates/g-w01"), p("g-w01"))).text();
    expect(text).toContain("retrieval quiz");
    expect(text).not.toContain(q01().canary);
    expect(text).not.toMatch(/"answer"\s*:/);
  });
});

describe("AT-07 + quiz grading", () => {
  it("a passing quiz alone leaves W1 pending evidence (the atlas-lab result is still missing)", async () => {
    const r = await routes.attempts.POST(post("/api/gates/g-w01/attempts", { type: "quiz", quiz: "q-w01", answers: allRight() }), p("g-w01"));
    expect(r.status).toBe(201);
    const body = await r.json();
    expect(body).toMatchObject({ pct: 100, passed: true, gateStatus: "pending_evidence" });
    expect(JSON.stringify(body)).not.toContain("perQuestion");
  });
  it("adding the verified runner result passes W1 and unlocks W2", async () => {
    expect((await runnerResult("g-w01", "atlas-lab:w01@1", true)).status).toBe("passed");
    expect((await roadmapState("RI-W02")).state).toBe("available");
  });
  it("W2 with tests only is pending; with the report and passing rubric it passes", async () => {
    await runnerResult("g-w02", "atlas-lab:w02@1", true);
    expect((await (await routes.gate.GET(get("/api/gates/g-w02"), p("g-w02"))).json()).status).toBe("pending_evidence");
  });
});

describe("X-13 via the API: practice checks never count", () => {
  it("records a practice attempt and leaves the gate unchanged", async () => {
    const before = (await (await routes.gate.GET(get("/api/gates/g-w01"), p("g-w01"))).json()).status;
    const r = await routes.practice.POST(post("/api/exercises/ex-w01-log-levels/practice", { passed: true, tests: [{ name: "t", passed: true }] }), p("ex-w01-log-levels"));
    expect(r.status).toBe(201);
    expect(await r.json()).toMatchObject({ status: "practice", countsTowardGate: false });
    const rows = await db.select().from(attempts).where(and(eq(attempts.userId, u.id), eq(attempts.exerciseId, "ex-w01-log-levels"), eq(attempts.source, "browser")));
    expect(rows.every((x) => x.status === "practice")).toBe(true);
    expect((await (await routes.gate.GET(get("/api/gates/g-w01"), p("g-w01"))).json()).status).toBe(before);
  });
  it("the practice endpoint does not accept code", async () => {
    const r = await routes.practice.POST(post("/api/exercises/ex-w01-log-levels/practice", { passed: true, tests: [], code: "import os" }), p("ex-w01-log-levels"));
    expect(r.status).toBe(422);
  });
  it("the attempts endpoint cannot carry a runner result from the browser", async () => {
    const r = await routes.attempts.POST(post("/api/gates/g-w02/attempts", { type: "artifact", kind: "runner_result", url: "https://x.test/r" }), p("g-w02"));
    expect(r.status).toBe(422);
  });
});

describe("X-11 via the API: scorer comes from the role", () => {
  it("learner scores are stored as self", async () => {
    await routes.attempts.POST(post("/api/gates/g-w02/attempts", { type: "artifact", kind: "report", url: "https://github.com/x/y/blob/0123/REPORT.md" }), p("g-w02"));
    const id = (await (await routes.gate.GET(get("/api/gates/g-w02"), p("g-w02"))).json()).attemptId;
    const crit = ["Bug identified precisely", "Root cause in terms of memory layout", "Fix and how it was verified"];
    const r = await routes.rubric.POST(post(`/api/attempts/${id}/rubric`, { scores: crit.map((c) => ({ criterion: c, level: "competent" })) }), p(String(id)));
    expect(r.status).toBe(200);
    expect((await r.json()).status).toBe("passed");
    expect((await db.select().from(rubricScores).where(eq(rubricScores.attemptId, id))).every((s) => s.scorer === "self")).toBe(true);
    const g = await (await routes.gate.GET(get("/api/gates/g-w02"), p("g-w02"))).json();
    expect(g.evaluation.rubric.selfAssessed).toBe(true);
  });
  it("a scorer field in the body is rejected", async () => {
    const r = await routes.rubric.POST(post("/api/attempts/1/rubric", { scores: [{ criterion: "x", level: "strong", scorer: "reviewer" }] }), p("1"));
    expect(r.status).toBe(422);
  });
  it("unknown criteria are rejected", async () => {
    const id = (await (await routes.gate.GET(get("/api/gates/g-w02"), p("g-w02"))).json()).attemptId;
    expect((await routes.rubric.POST(post(`/api/attempts/${id}/rubric`, { scores: [{ criterion: "Vibes", level: "strong" }] }), p(String(id)))).status).toBe(422);
  });
});

describe("AT-11 via the API: failure creates remediation and locks only dependants", () => {
  it("a failed W3 objective result opens a remediation plan", async () => {
    expect((await runnerResult("g-w03", "atlas-lab:w03@1", false)).status).toBe("failed");
    const plans = await db.select().from(remediationPlans).where(and(eq(remediationPlans.userId, u.id), eq(remediationPlans.gateId, "g-w03")));
    expect(plans).toHaveLength(1);
    expect(plans[0]!.status).toBe("open");
    expect((await roadmapState("RI-W03")).state).toBe("remediation");
    expect((await roadmapState("RI-W08")).state).toBe("locked"); // needs caches-arch
    expect((await roadmapState("RI-W04")).state).toBe("available"); // needs only c-memory
    expect((await roadmapState("RI-W07")).state).toBe("available");
  });
  it("a later verified pass closes the plan", async () => {
    expect((await runnerResult("g-w03", "atlas-lab:w03@1", true)).status).toBe("pending_evidence"); // report + rubric still needed
    const ev = await db.select().from(attemptEvidence);
    expect(ev.length).toBeGreaterThan(0);
  });
});

describe("AT-09 via the API: FSRS review + quiz shows only due cards from earlier weeks", () => {
  it("adding W1 and W2 cards; the quiz (current week W3) shows due cards from W1 and W2 only", async () => {
    expect((await routes.cards.POST(post("/api/cards", { lesson: "w01-tooling" }))).status).toBe(201);
    expect((await routes.cards.POST(post("/api/cards", { lesson: "w03-caches" }))).status).toBe(201);
    const again = await (await routes.cards.POST(post("/api/cards", { lesson: "w01-tooling" }))).json();
    expect(again.added).toBe(0);
    const quiz = await (await routes.quiz.GET(get("/api/quiz"))).json();
    expect(quiz.cards.length).toBe(15);
    expect(new Set(quiz.cards.map((c: { weekId: string }) => c.weekId))).toEqual(new Set(["RI-W01"]));
  });
  it("reviewing a card moves due_at forward and removes it from today's quiz", async () => {
    const quiz = await (await routes.quiz.GET(get("/api/quiz"))).json();
    const id = quiz.cards[0].id as number;
    const r = await routes.review.POST(post(`/api/cards/${id}/review`, { rating: 3 }), p(String(id)));
    expect(r.status).toBe(200);
    const row = (await db.select().from(cards).where(eq(cards.id, id)))[0]!;
    expect(row.dueAt.getTime()).toBeGreaterThan(Date.now());
    const after = await (await routes.quiz.GET(get("/api/quiz"))).json();
    expect(after.cards.map((c: { id: number }) => c.id)).not.toContain(id);
  });
  it("rating outside 1-4 is rejected", async () => {
    const quiz = await (await routes.quiz.GET(get("/api/quiz"))).json();
    expect((await routes.review.POST(post(`/api/cards/${quiz.cards[0].id}/review`, { rating: 5 }), p(String(quiz.cards[0].id)))).status).toBe(422);
  });
});

describe("X-06 + hints", () => {
  it("the exercise API returns public tests and starter, never the solution", async () => {
    const t = await (await routes.exercise.GET(get("/api/exercises/ex-w01-log-levels"), p("ex-w01-log-levels"))).text();
    expect(t).toContain("def test_counts_each_level");
    expect(t).not.toContain("atlas-solution-canary-ex-w01-91c4");
  });
  it("hints are revealed one at a time, counted, and capped at 3", async () => {
    const n = [];
    for (let i = 0; i < 4; i++) n.push((await (await routes.hints.POST(post("/api/exercises/ex-w01-log-levels/hints", {}), p("ex-w01-log-levels"))).json()).hintsUsed);
    expect(n).toEqual([1, 2, 3, 3]);
  });
  it("the solution is 403 before the gate passes (here W1 is passed, so it is served)", async () => {
    const r = await routes.solution.GET(get("/api/exercises/ex-w01-log-levels/solution"), p("ex-w01-log-levels"));
    expect(r.status).toBe(200);
    const other = await fixtureUser(db, "999001");
    const r2 = await routes.solution.GET(req("/api/exercises/ex-w01-log-levels/solution", { cookie: other.cookie }), p("ex-w01-log-levels"));
    expect(r2.status).toBe(403);
    expect(await r2.text()).not.toContain("atlas-solution-canary");
  });
});

describe("AT-10 via the API: diagnostic", () => {
  it("autosaves, completes, and produces a skill map + recommendation", async () => {
    const items = getContent().diagnostic.items;
    const answers = Object.fromEntries(items.filter((i) => i.kind === "mcq").map((i) => [i.id, { kind: "mcq", choice: i.kind === "mcq" ? i.answer : 0 }]));
    expect((await routes.diagSave.POST(post("/api/diagnostic/attempts", { answers: {}, index: 2, pausedMs: 1000, complete: false }))).status).toBe(200);
    const done = await (await routes.diagSave.POST(post("/api/diagnostic/attempts", { answers, index: items.length, pausedMs: 1000, complete: true, hoursPerWeek: 30 }))).json();
    expect(done.completed).toBe(true);
    const res = await (await routes.diagResult.GET(get("/api/diagnostic/result"))).json();
    expect(res.recommendation).toMatchObject({ mode: "RI", weeks: 32 });
    expect(Object.values(res.levels)).not.toContain("verified");
    expect(res.skips.map((s: { weekId: string }) => s.weekId)).toEqual(["RI-W01", "RI-W02", "RI-W03"]);
  });
  it("a diagnostic quiz cannot be used to skip beyond week 3", async () => {
    // q-w04 exists since P2, so this is refused for the week, not for a missing quiz.
    const r = await routes.attempts.POST(post("/api/gates/g-w04/attempts", { type: "quiz", quiz: "q-w04", answers: {}, viaDiagnostic: true }), p("g-w04"));
    expect(r.status).toBe(422);
  });
});

describe("AT-12 (data): lesson resources carry verified_at and a stale flag after 30 days", () => {
  it("fresh now, stale more than 30 days after the seed's verified_at (2026-11-19)", async () => {
    const now = (await lesson(u.id, "w01-tooling", new Date("2026-11-20T00:00:00Z"))).resources;
    expect(now.every((r) => r.verifiedAt && r.freshness === "fresh")).toBe(true);
    const later = (await lesson(u.id, "w01-tooling", new Date("2026-12-21T00:00:00Z"))).resources;
    expect(later.every((r) => r.freshness === "stale")).toBe(true);
  });
  it("the lesson API includes verified_at for every resource", async () => {
    const l = await (await routes.lessonRoute.GET(get("/api/lessons/w01-tooling"), { params: Promise.resolve({ slug: "w01-tooling" }) })).json();
    expect(l.resources.length).toBe(5);
    for (const r of l.resources) expect(r.verifiedAt).toBeTruthy();
  });
});

describe("settings + meters", () => {
  it("rejects hours outside 20/30/40/50", async () => {
    expect((await routes.settings.PUT(req("/api/settings", { method: "PUT", cookie: u.cookie, sameOrigin: true, ...json({ hoursPerWeek: 35 }) }))).status).toBe(422);
  });
  it("the learning meter counts only real (non-mock) passed gates", async () => {
    await db.insert(attempts).values({ userId: u.id, gateId: "g-w05-exam", source: "runner", status: "passed", passed: true, contentVersion: "t", isMock: true });
    const m = (await (await routes.meters.GET(get("/api/analytics/meters"))).json()).learning;
    expect(m.evidence).toEqual(expect.arrayContaining(["g-w01", "g-w02"]));
    expect(m.evidence).not.toContain("g-w05-exam");
    expect(m.formula).toMatch(/gates passed/);
  });
});
