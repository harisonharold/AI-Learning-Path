import { describe, expect, it } from "vitest";
import { diagnosticSkipAllowed, recommend, scoreDiagnostic } from "../internal/diagnostic.ts";
import { newCardState, review } from "../internal/fsrs.ts";
import { estimateFinish, learningMeter, remediationFor } from "../internal/progress.ts";
import { gradeQuiz, publicQuiz } from "../internal/quiz.ts";
import { content, gate, t } from "./helpers.ts";

describe("AT-09 (scheduling part): FSRS review updates due_at per ts-fsrs", () => {
  const now = t(0);
  it("a new card is due now", () => expect(new Date(newCardState(now).due)).toEqual(now));
  it("every rating moves due forward; better ratings never schedule earlier", () => {
    const dues = ([1, 2, 3, 4] as const).map((r) => review(newCardState(now), r, now).due.getTime());
    for (const d of dues) expect(d).toBeGreaterThan(now.getTime());
    expect(dues).toEqual([...dues].sort((a, b) => a - b));
  });
  it("is deterministic (fuzz off)", () => expect(review(newCardState(now), 3, now)).toEqual(review(newCardState(now), 3, now)));
  it("a Good review of a reviewed card schedules days ahead", () => {
    let s = newCardState(now);
    let when = now;
    for (let i = 0; i < 3; i++) { const r = review(s, 3, when); s = r.state; when = r.due; }
    expect(review(s, 3, when).scheduledDays).toBeGreaterThanOrEqual(1);
  });
});

describe("server-graded quizzes", () => {
  const q = content.quizzes.get("q-w01")!;
  it("the public view has no answers or canary", () => {
    const pub = JSON.stringify(publicQuiz(q));
    expect(pub).not.toContain('"answer"');
    expect(pub).not.toContain(q.canary);
  });
  it("80% passes, 70% fails", () => {
    const all = Object.fromEntries(q.questions.map((x) => [x.id, x.answer]));
    const wrong = (n: number) => ({ ...all, ...Object.fromEntries(q.questions.slice(0, n).map((x) => [x.id, (x.answer + 1) % x.choices.length])) });
    expect(gradeQuiz(q, wrong(2))).toMatchObject({ pct: 80, passed: true });
    expect(gradeQuiz(q, wrong(3))).toMatchObject({ pct: 70, passed: false });
  });
});

describe("AT-10: the diagnostic may skip only W1-W3", () => {
  it.each([[1, true], [2, true], [3, true], [4, false], [12, false], [0, false]])("ordinal %i -> %s", (o, ok) => expect(diagnosticSkipAllowed(o)).toBe(ok));
  it("skill levels from the diagnostic never reach 'verified'", () => {
    const items = content.diagnostic.items;
    const answers = Object.fromEntries(items.filter((i) => i.kind === "mcq").map((i) => [i.id, { kind: "mcq" as const, choice: i.kind === "mcq" ? i.answer : null }]));
    const r = scoreDiagnostic(items, answers);
    expect(Object.values(r.levels)).not.toContain("verified");
  });
  it("'I don't know' is counted separately from wrong answers", () => {
    const r = scoreDiagnostic(content.diagnostic.items, { "d-py-1": { kind: "idk" } });
    expect(r.perSkill["py-tooling"]!.idk).toBe(1);
    expect(r.perSkill["py-tooling"]!.correct).toBe(0);
  });
  it("recommends RI below 50 h/week and gives a calendar from B.1", () => {
    expect(recommend(content.curriculum, 0.9, 40)).toMatchObject({ mode: "RI", weeks: 24 });
    expect(recommend(content.curriculum, 0.9, 20)).toMatchObject({ mode: "RI", weeks: 48 });
    expect(recommend(content.curriculum, 0.9, 50)).toMatchObject({ mode: "ACC", weeks: 16 });
    expect(recommend(content.curriculum, 0.5, 50)).toMatchObject({ mode: "RI" });
  });
});

describe("remediation, meter, estimate", () => {
  it("the concurrency exam blocks re-attempts for 48 h (B.6)", () => {
    const r = remediationFor(gate("g-w05-exam"), t(0));
    expect(r.reattemptAfter!.getTime() - t(0).getTime()).toBe(48 * 3600_000);
    expect(r.track).toMatch(/OSTEP/);
  });
  it("gates without a configured track get the generic one and no wait", () => expect(remediationFor(gate("g-w02"), t(0)).reattemptAfter).toBeNull());
  it("learning meter shows its formula and never merges with other meters", () => {
    const m = learningMeter({ gatesInMode: 30, gatesPassed: 3, reviews30d: [{ rating: 1 }, { rating: 3 }, { rating: 3 }, { rating: 4 }], passedGateIds: ["g-w01"] });
    expect(m).toMatchObject({ meter: "learning_progress", gatesPassed: 3, gatesInMode: 30, retention: 0.75 });
    expect(m.formula).toMatch(/gates passed/);
  });
  it("finish estimate: planning until two weeks pass, then actual pace", () => {
    expect(estimateFinish({ plannedHours: 960, hoursPerWeek: 40, gatesInMode: 30, gatesPassed: 1, weeksPassed: 1, minutesOnPassedGates: 600, now: t(0) })).toMatchObject({ method: "planning", weeks: 24 });
    const a = estimateFinish({ plannedHours: 960, hoursPerWeek: 20, gatesInMode: 30, gatesPassed: 2, weeksPassed: 2, minutesOnPassedGates: 2 * 40 * 60, now: t(0) });
    expect(a).toMatchObject({ method: "actual", weeks: Math.ceil((40 * 28) / 20) });
  });
});
