import "server-only";
/**
 * Public surface of the learning module. Route handlers and pages call only these functions.
 * Every function takes the session user's id and scopes all reads/writes to it.
 */
import { freshness } from "../research/service.ts";
import { getContent, readSolution } from "./internal/content.ts";
import type { EvidenceKind, Gate, RiWeek } from "./internal/content-schema.ts";
import { diagnosticSkipAllowed, recommend, scoreDiagnostic, type DiagAnswer } from "./internal/diagnostic.ts";
import { newCardState, review, type StoredCard } from "./internal/fsrs.ts";
import { estimateFinish, learningMeter, remediationFor } from "./internal/progress.ts";
import { gradeQuiz, publicQuiz } from "./internal/quiz.ts";
import * as repo from "./internal/repo.ts";
import { computeRoadmap, type Roadmap } from "./internal/roadmap.ts";
import { seedContent } from "./internal/seed.ts";

export type { Roadmap };
export { getContent };
export const DEFAULTS = { mode: "RI" as const, hoursPerWeek: 40 };

export class LearningError extends Error {
  constructor(public code: "NOT_FOUND" | "FORBIDDEN" | "LOCKED" | "REATTEMPT_WAIT" | "ALREADY_PASSED" | "INVALID" | "NOT_AVAILABLE", message: string, public details: Record<string, unknown> = {}) {
    super(message);
  }
}

export async function seed() {
  await seedContent(getContent());
}

const findGate = (id: string): { gate: Gate; week: RiWeek } | undefined => {
  for (const w of getContent().curriculum.ri_weeks) for (const g of w.gates) if (g.id === id) return { gate: { ...g, skills: g.skills ?? w.skills }, week: w };
  return undefined;
};

export async function settings(userId: string) {
  const s = await repo.getSettings(userId);
  return { ...s, mode: s.mode ?? DEFAULTS.mode, hoursPerWeek: s.hoursPerWeek ?? DEFAULTS.hoursPerWeek, configured: s.mode !== null };
}
export async function updateSettings(userId: string, s: { mode?: "RI" | "ACC"; hoursPerWeek?: number; timezone?: string; sampleData?: boolean }) {
  await repo.putSettings(userId, s);
  return settings(userId);
}

export async function roadmap(userId: string) {
  const c = getContent();
  const s = await settings(userId);
  const gd = await repo.gateData(userId, c);
  const rem = await repo.openRemediationGates(userId);
  const r = computeRoadmap({ curriculum: c.curriculum, mode: s.mode, gateStatus: new Map([...gd].map(([k, v]) => [k, v.status])), openRemediationGates: new Set(rem.map((x) => x.gateId)) });
  const gatesInMode = r.weeks.flatMap((w) => w.gateIds);
  const passed = gatesInMode.filter((g) => gd.get(g)?.status === "passed");
  const minutes = await repo.minutesByWeek(userId);
  const passedWeeks = r.weeks.filter((w) => w.state === "passed");
  const minutesOnPassed = passedWeeks.flatMap((w) => w.riWeekIds.concat(w.id)).reduce((a, id) => a + (minutes.get(id) ?? 0), 0);
  const estimate = estimateFinish({ plannedHours: c.curriculum.hours_estimate[s.mode], hoursPerWeek: s.hoursPerWeek, gatesInMode: gatesInMode.length, gatesPassed: passed.length,
    weeksPassed: passedWeeks.length, minutesOnPassedGates: minutesOnPassed, now: new Date() });
  const gateInfo = Object.fromEntries([...gd].map(([k, v]) => [k, { status: v.status, selfAssessed: v.selfAssessed, title: findGate(k)!.gate.title, kind: findGate(k)!.gate.kind }]));
  return { mode: s.mode, hoursPerWeek: s.hoursPerWeek, roadmap: r, gates: gateInfo, estimate, gatesInMode: gatesInMode.length, gatesPassed: passed.length, passedGateIds: passed };
}

function weekIdsBefore(r: Roadmap, mode: "RI" | "ACC") {
  const c = getContent().curriculum;
  const cur = r.currentRiOrdinal ?? 25;
  const ri = c.ri_weeks.filter((w) => w.ordinal < cur).map((w) => w.id);
  return mode === "RI" ? ri : ri; // cards are stored against RI weeks in both modes
}

/** AT-09: today's quiz lists only due cards from weeks before the current one. */
export async function dueQuiz(userId: string, now = new Date()) {
  const rm = await roadmap(userId);
  const earlier = weekIdsBefore(rm.roadmap, rm.mode);
  return { cards: await repo.dueCards(userId, now, earlier), earlierWeeks: earlier };
}

export async function reviewCard(userId: string, cardId: number, rating: 1 | 2 | 3 | 4, now = new Date()) {
  const card = await repo.getCard(cardId);
  if (!card) throw new LearningError("NOT_FOUND", "Card not found.");
  if (card.userId !== userId) throw new LearningError("FORBIDDEN", "Not your card.");
  const r = review(card.fsrsState as StoredCard, rating, now);
  await repo.saveReview(card, rating, r.state, r.due, r.elapsedDays, r.scheduledDays);
  return { cardId, dueAt: r.due, scheduledDays: r.scheduledDays };
}

export async function addLessonCards(userId: string, slug: string, now = new Date()) {
  const l = getContent().lessons.find((x) => x.slug === slug);
  if (!l) throw new LearningError("NOT_FOUND", "Lesson not found.");
  const skill = getContent().curriculum.ri_weeks.find((w) => w.id === l.week)!.skills[0]!;
  const have = await repo.existingCardFronts(userId, l.week);
  const rows = l.cards.filter((c) => !have.has(c.front)).map((c) => ({ userId, skillId: skill, weekId: l.week, origin: "lesson" as const, front: c.front, back: c.back, fsrsState: newCardState(now), dueAt: now }));
  await repo.insertCards(rows);
  return { added: rows.length, alreadyInDeck: have.size };
}

export async function lesson(userId: string, slug: string, now = new Date()) {
  const c = getContent();
  const l = c.lessons.find((x) => x.slug === slug);
  if (!l) throw new LearningError("NOT_FOUND", "Lesson not found.");
  const rm = await roadmap(userId);
  const week = rm.roadmap.weeks.find((w) => w.riWeekIds.includes(l.week));
  const defs = l.resources.map((id) => c.sources.find((s) => s.id === id)!);
  const rows = await repo.sourcesByUrl(defs.map((d) => d.url));
  const resources = defs.map((d) => {
    const row = rows.find((r) => r.url === d.url);
    const verifiedAt = row ? row.verifiedAt : d.verified_at;
    const verification = row?.verification ?? d.verification;
    return { id: d.id, sourceId: row?.id ?? null, title: d.title, url: d.url, kind: d.kind, note: d.note ?? null, verification, verifiedAt, freshness: freshness({ verification, verifiedAt }, now) };
  });
  const have = await repo.existingCardFronts(userId, l.week);
  return { slug: l.slug, title: l.title, weekId: l.week, weekState: week?.state ?? "locked", lockedBy: week?.lockedBy ?? [], body: c.lessonBodies.get(l.slug)!, resources,
    cards: l.cards.map((x) => ({ ...x, inDeck: have.has(x.front) })), exercises: l.exercises.map((id) => ({ id, title: c.exercises.get(id)!.title })),
    gates: c.curriculum.ri_weeks.find((w) => w.id === l.week)!.gates.map((g) => ({ id: g.id, title: g.title })) };
}

export async function gate(userId: string, gateId: string) {
  const f = findGate(gateId);
  if (!f) throw new LearningError("NOT_FOUND", "Gate not found.");
  const rm = await roadmap(userId);
  const week = rm.roadmap.weeks.find((w) => w.riWeekIds.includes(f.week.id))!;
  const gd = (await repo.gateData(userId, getContent())).get(gateId)!;
  const rem = (await repo.openRemediationGates(userId)).find((r) => r.gateId === gateId) ?? null;
  const quizzes = f.gate.required_evidence.filter((e) => e.kind === "server_graded").map((e) => {
    const q = getContent().quizzes.get(e.quiz!);
    return q ? publicQuiz(q) : { id: e.quiz!, title: "Quiz content arrives with this week's lessons", pass_pct: e.pass_pct!, questions: [], pending: true };
  });
  return { id: f.gate.id, title: f.gate.title, kind: f.gate.kind, objective: f.gate.objective, weekId: f.week.id, weekTitle: f.week.title, weekState: week.state, lockedBy: week.lockedBy,
    status: gd.status, evaluation: gd.evaluation, attemptId: gd.openAttemptId ?? gd.lastAttemptId, rubric: (f.gate.rubric ?? []).map((r) => r.criterion), quizzes,
    remediation: rem ? { reattemptAfter: rem.reattemptAfter } : null, noAiCode: f.week.no_ai_code, publishRestricted: f.week.publish_restricted, restrictionNote: f.week.restriction_note ?? null };
}

async function writableAttempt(userId: string, gateId: string, source: "manual" | "server" | "diagnostic" | "runner" = "manual") {
  const f = findGate(gateId);
  if (!f) throw new LearningError("NOT_FOUND", "Gate not found.");
  const g = await gate(userId, gateId);
  if (g.weekState === "locked" && source !== "diagnostic") throw new LearningError("LOCKED", "This week is locked.", { lockedBy: g.lockedBy });
  const a = await repo.openAttempt(userId, gateId, getContent().curriculum.content_version, source);
  if ("error" in a) {
    if (a.error === "REATTEMPT_WAIT") throw new LearningError("REATTEMPT_WAIT", "Remediation first: re-attempt opens later.", { until: a.until });
    throw new LearningError("ALREADY_PASSED", "This gate is already passed.");
  }
  return { attemptId: a.id, gate: f.gate };
}

/** Manual evidence the learner can add in P1: artifact links. Objective results come from atlas-lab (P2) or server grading. */
export async function submitArtifact(userId: string, gateId: string, input: { kind: Extract<EvidenceKind, "report" | "recording" | "github_commit">; url: string; commitSha?: string | undefined }) {
  const { attemptId, gate: g } = await writableAttempt(userId, gateId);
  if (!g.required_evidence.some((r) => r.kind === input.kind)) throw new LearningError("INVALID", `This gate does not take ${input.kind} evidence.`);
  // github_commit is unverified until the GitHub module checks it (P4): it cannot satisfy a requirement before then.
  await repo.addEvidence(attemptId, { kind: input.kind, url: input.url, commitSha: input.commitSha ?? null, passed: null, verified: false, method: "learner link" });
  return repo.settleAttempt(userId, attemptId, g, remediationFor);
}

export async function submitQuiz(userId: string, gateId: string, quizId: string, answers: Record<string, number | null>, source: "manual" | "diagnostic" = "manual") {
  const q = getContent().quizzes.get(quizId);
  const f = findGate(gateId);
  if (!q || !f || !f.gate.required_evidence.some((e) => e.kind === "server_graded" && e.quiz === quizId)) throw new LearningError("NOT_FOUND", "Quiz not found for this gate.");
  if (source === "diagnostic" && !diagnosticSkipAllowed(f.week.ordinal)) throw new LearningError("INVALID", "The diagnostic can only skip weeks 1-3.");
  const { attemptId, gate: g } = await writableAttempt(userId, gateId, source === "diagnostic" ? "diagnostic" : "server");
  const result = gradeQuiz(q, answers);
  await repo.addEvidence(attemptId, { kind: "server_graded", quiz: quizId, passed: result.passed, verified: true, method: `server-graded ${result.correct}/${result.total}` });
  const settled = await repo.settleAttempt(userId, attemptId, g, remediationFor);
  return { ...result, perQuestion: undefined, gateStatus: settled.status };
}

/** atlas-lab: the hidden-test bundle for a gate (runner token, scope tests:read). Never reaches the browser (X-06). */
export function gateBundle(ref: string) {
  const b = getContent().gateBundles.get(ref);
  if (!b) throw new LearningError("NOT_FOUND", "No test bundle with that reference.");
  const { fileContents, sha256, ...manifest } = b;
  return { ref: b.ref, sha256, manifest, files: fileContents };
}

export interface RunnerGateResult {
  bundle: string; bundle_sha256: string; runner_version: string;
  results: { test: string; passed: boolean; duration_ms: number; message?: string | undefined }[];
  docker: { image_digest: string; network: "none" };
}

/**
 * Records an atlas-lab gate run as runner_result evidence (counting evidence, D-15). The server re-checks what it can:
 * the bundle hash must be the current bundle's and the result must list exactly the bundle's tests. The learner's
 * machine could still forge a run (THREAT RR1); every gate shows which evidence passed it.
 */
export async function recordRunnerResult(userId: string, r: RunnerGateResult) {
  const b = getContent().gateBundles.get(r.bundle);
  if (!b) throw new LearningError("NOT_FOUND", "No test bundle with that reference.");
  if (r.bundle_sha256 !== b.sha256) throw new LearningError("INVALID", "The bundle you ran is not the current one. Run `atlas-lab gate` again to fetch it.", { expected: b.sha256 });
  const names = r.results.map((x) => x.test);
  if (names.length !== b.tests.length || new Set(names).size !== names.length || b.tests.some((t) => !names.includes(t))) {
    throw new LearningError("INVALID", "The result must list exactly the bundle's tests.", { expected: b.tests });
  }
  const gateId = findGateByRef(r.bundle);
  if (!gateId) throw new LearningError("NOT_FOUND", "No gate uses this bundle.");
  const { attemptId, gate: g } = await writableAttempt(userId, gateId, "runner");
  const passedCount = r.results.filter((x) => x.passed).length;
  await repo.addEvidence(attemptId, {
    kind: "runner_result", ref: r.bundle, passed: passedCount === b.tests.length, verified: true,
    method: `atlas-lab ${r.runner_version}: ${passedCount}/${b.tests.length} hidden tests; bundle ${b.sha256.slice(0, 12)}; image ${r.docker.image_digest.slice(7, 19)}; network none`,
  });
  const settled = await repo.settleAttempt(userId, attemptId, g, remediationFor);
  return { gateId, attemptId, passed: passedCount === b.tests.length, passedCount, total: b.tests.length, gateStatus: settled.status,
    failures: r.results.filter((x) => !x.passed).map((x) => ({ test: x.test, message: x.message ?? null })) };
}

function findGateByRef(ref: string): string | undefined {
  for (const w of getContent().curriculum.ri_weeks) for (const g of w.gates) if (g.required_evidence.some((e) => e.kind === "runner_result" && e.ref === ref)) return g.id;
  return undefined;
}

export async function scoreRubric(userId: string, attemptId: number, role: "self" | "reviewer", scores: { criterion: string; level: "missing" | "partial" | "competent" | "strong"; note?: string | undefined }[]) {
  const a = await repo.attemptById(attemptId);
  if (!a) throw new LearningError("NOT_FOUND", "Attempt not found.");
  if (a.userId !== userId && role !== "reviewer") throw new LearningError("FORBIDDEN", "Not your attempt.");
  if (a.status === "practice") throw new LearningError("INVALID", "Practice checks cannot be scored.");
  const f = findGate(a.gateId)!;
  const valid = new Set((f.gate.rubric ?? []).map((r) => r.criterion));
  const bad = scores.filter((s) => !valid.has(s.criterion));
  if (bad.length) throw new LearningError("INVALID", "Unknown rubric criterion.", { criteria: bad.map((b) => b.criterion) });
  await repo.addRubricScores(attemptId, userId, role, scores);
  return repo.settleAttempt(a.userId, attemptId, f.gate, remediationFor);
}

export async function exercise(userId: string, id: string) {
  const e = getContent().exercises.get(id);
  if (!e) throw new LearningError("NOT_FOUND", "Exercise not found.");
  const used = await repo.hintsUsed(userId, id);
  const g = await gate(userId, e.gate);
  return { id: e.id, title: e.title, prompt: e.prompt, starter: e.starter, practiceTests: e.practiceTests, practiceRuntime: e.practice_runtime, gateId: e.gate, gateTitle: g.title,
    gateStatus: g.status, gateTestsRef: e.gate_tests_ref, weekState: g.weekState, hintsUsed: used, hints: e.hints.slice(0, used), noAiCode: g.noAiCode };
}

export async function revealHint(userId: string, id: string) {
  const e = getContent().exercises.get(id);
  if (!e) throw new LearningError("NOT_FOUND", "Exercise not found.");
  const used = await repo.revealHint(userId, e.gate, id, getContent().curriculum.content_version);
  return { hintsUsed: used, hints: e.hints.slice(0, used) };
}

/** AT-08 / D-15: browser results are stored as practice checks and never change gate state. */
export async function recordPractice(userId: string, id: string, result: { passed: boolean; tests: { name: string; passed: boolean; message?: string | undefined }[] }) {
  const e = getContent().exercises.get(id);
  if (!e) throw new LearningError("NOT_FOUND", "Exercise not found.");
  const attemptId = await repo.recordPractice(userId, e.gate, id, getContent().curriculum.content_version, result.passed, { tests: result.tests });
  return { attemptId, status: "practice" as const, countsTowardGate: false };
}

/** X-06: the reference solution is served only after the exercise's gate is passed. */
export async function solution(userId: string, id: string) {
  const e = getContent().exercises.get(id);
  if (!e) throw new LearningError("NOT_FOUND", "Exercise not found.");
  const g = await gate(userId, e.gate);
  if (g.status !== "passed") throw new LearningError("FORBIDDEN", "The reference solution unlocks after you pass this gate.");
  return { id, solution: readSolution(id) };
}

export async function meters(userId: string, now = new Date()) {
  const rm = await roadmap(userId);
  const reviews = await repo.reviewsSince(userId, new Date(now.getTime() - 30 * 86_400_000));
  return { learning: learningMeter({ gatesInMode: rm.gatesInMode, gatesPassed: rm.gatesPassed, reviews30d: reviews, passedGateIds: rm.passedGateIds }) };
}

export async function logTime(userId: string, weekId: string, minutes: number, category: string, source: "timer" | "manual") {
  if (!getContent().curriculum.ri_weeks.some((w) => w.id === weekId) && !getContent().curriculum.acc_weeks.some((w) => w.id === weekId)) throw new LearningError("NOT_FOUND", "Unknown week.");
  await repo.addTimeLog(userId, weekId, minutes, category, new Date(), source);
  return { ok: true };
}

export async function today(userId: string, now = new Date()) {
  const rm = await roadmap(userId);
  const quiz = await dueQuiz(userId, now);
  const diag = await repo.latestDiagnostic(userId);
  const current = rm.roadmap.weeks.find((w) => w.id === rm.roadmap.currentWeekId) ?? null;
  const c = getContent();
  const lessonsForCurrent = current ? c.lessons.filter((l) => current.riWeekIds.includes(l.week)) : [];
  const currentGates = current ? await Promise.all(current.gateIds.map((g) => gate(userId, g))) : [];
  const dailyMinutes = Math.round((rm.hoursPerWeek * 60) / 6); // B.1 example: six working days
  const plan = [
    ...(quiz.cards.length ? [{ kind: "quiz", title: `Retrieval quiz: ${quiz.cards.length} due card(s)`, minutes: 15, href: "/workspace" }] : []),
    ...lessonsForCurrent.map((l) => ({ kind: "lesson", title: `Lesson: ${l.title}`, minutes: 60, href: `/learn/${l.slug}` })),
    ...lessonsForCurrent.flatMap((l) => l.exercises.map((e) => ({ kind: "exercise", title: `Practice: ${c.exercises.get(e)!.title}`, minutes: 45, href: `/lab/exercises/${e}` }))),
    ...currentGates.filter((g) => g.status !== "passed").map((g) => ({ kind: "gate", title: `Gate: ${g.title}`, minutes: 60, href: `/gates/${g.id}` })),
  ];
  return { firstDay: !diag && rm.gatesPassed === 0, diagnosticDone: Boolean(diag?.completedAt), dailyMinutes, plan, dueCards: quiz.cards.length, current, currentGates: currentGates.map((g) => ({ id: g.id, title: g.title, status: g.status, missing: g.evaluation.missing })),
    estimate: rm.estimate, mode: rm.mode, hoursPerWeek: rm.hoursPerWeek };
}

// ---- diagnostic ----
type DiagState = { answers: Record<string, DiagAnswer>; index: number; hoursPerWeek?: number };

export async function diagnosticState(userId: string) {
  const d = await repo.latestDiagnostic(userId);
  const items = getContent().diagnostic.items.map((i) => (i.kind === "mcq" ? { id: i.id, kind: i.kind, skill: i.skill, prompt: i.prompt, choices: i.choices } : i.kind === "code" ? { id: i.id, kind: i.kind, skill: i.skill, prompt: i.prompt, exercise: i.exercise } : { id: i.id, kind: i.kind, skill: i.skill, prompt: i.prompt }));
  return { session: d ? { id: d.id, state: d.stateJson as DiagState, pausedMs: d.pausedMs, startedAt: d.startedAt, completedAt: d.completedAt } : null, items };
}

export async function saveDiagnostic(userId: string, input: { answers: Record<string, DiagAnswer>; index: number; pausedMs: number; complete: boolean; hoursPerWeek?: number | undefined }) {
  let d = await repo.latestDiagnostic(userId);
  if (!d || d.completedAt) { await repo.startDiagnostic(userId); d = (await repo.latestDiagnostic(userId))!; }
  const valid = new Set(getContent().diagnostic.items.map((i) => i.id));
  const answers = Object.fromEntries(Object.entries(input.answers).filter(([k]) => valid.has(k)));
  const state: DiagState = { answers: { ...(d.stateJson as DiagState).answers, ...answers }, index: input.index, ...(input.hoursPerWeek ? { hoursPerWeek: input.hoursPerWeek } : {}) };
  const result = input.complete ? diagnosticResultFrom(state) : null;
  await repo.saveDiagnostic(d.id, state, input.pausedMs, result);
  return { id: d.id, completed: Boolean(result), result };
}

function diagnosticResultFrom(state: DiagState) {
  const c = getContent();
  const s = scoreDiagnostic(c.diagnostic.items, state.answers);
  const hours = state.hoursPerWeek ?? DEFAULTS.hoursPerWeek;
  const rec = { ...recommend(c.curriculum, s.overall, hours), hoursPerWeek: hours };
  return { levels: s.levels, perSkill: s.perSkill, overall: s.overall, recommendation: rec };
}

export async function diagnosticResult(userId: string) {
  const d = await repo.latestDiagnostic(userId);
  if (!d?.completedAt) return null;
  const rm = await roadmap(userId);
  const c = getContent();
  const skips = c.curriculum.ri_weeks.filter((w) => w.ordinal <= 3).map((w) => {
    const passed = w.gates.every((g) => rm.gates[g.id]?.status === "passed");
    return { weekId: w.id, title: w.title, skipped: passed, howToSkip: passed ? null : `Pass ${w.gates.map((g) => g.title).join(" and ")} with counting evidence: atlas-lab results (arrives in P2) and any server-graded quiz. Browser practice checks cannot skip a week.` };
  });
  return { completedAt: d.completedAt, ...(d.resultJson as object), skips, skippableWeeks: "Only weeks 1-3 can be skipped, and only by passing their gates." };
}
