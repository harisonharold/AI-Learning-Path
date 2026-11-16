import "server-only";
import { and, asc, desc, eq, gte, inArray, lte, ne, sql } from "drizzle-orm";
import { getDb } from "../../../db/client.ts";
import { attemptEvidence, attempts, cardReviews, cards, diagnosticSessions, remediationPlans, rubricScores, sources, timeLogs, userSettings, userSkillState } from "../../../db/schema/index.ts";
import { evaluateGate, type EvidenceItem, type GateStatus, type RubricScore } from "./gates.ts";
import type { Content, Gate } from "./content-schema.ts";

/** All queries add is_mock = false where mock rows can exist (AT-20 groundwork) and scope by user. */
export async function getSettings(userId: string) {
  const row = (await getDb().select().from(userSettings).where(eq(userSettings.userId, userId)).limit(1))[0];
  return { mode: row?.mode ?? null, hoursPerWeek: row?.hoursPerWeek ?? null, timezone: row?.timezone ?? "America/Toronto", sampleData: row?.sampleData ?? false };
}

export async function putSettings(userId: string, s: { mode?: "RI" | "ACC"; hoursPerWeek?: number; timezone?: string }) {
  await getDb().insert(userSettings).values({ userId, ...s }).onDuplicateKeyUpdate({ set: s });
}

export interface GateData { status: GateStatus; evaluation: ReturnType<typeof evaluateGate>; openAttemptId: number | null; lastAttemptId: number | null; selfAssessed: boolean }

/** Evaluates every gate for a user from the latest non-practice attempt per gate (practice rows are excluded: X-13). */
export async function gateData(userId: string, content: Content): Promise<Map<string, GateData>> {
  const db = getDb();
  const rows = await db.select().from(attempts)
    .where(and(eq(attempts.userId, userId), ne(attempts.status, "practice"), eq(attempts.isMock, false)))
    .orderBy(asc(attempts.createdAt), asc(attempts.id));
  const latestByGate = new Map<string, (typeof rows)[number]>();
  for (const r of rows) latestByGate.set(r.gateId, r);
  const ids = [...latestByGate.values()].map((r) => r.id);
  const ev = ids.length ? await db.select().from(attemptEvidence).where(inArray(attemptEvidence.attemptId, ids)) : [];
  const sc = ids.length ? await db.select().from(rubricScores).where(inArray(rubricScores.attemptId, ids)) : [];
  const out = new Map<string, GateData>();
  for (const g of content.curriculum.ri_weeks.flatMap((w) => w.gates)) {
    const a = latestByGate.get(g.id);
    const evidence: EvidenceItem[] = a ? ev.filter((e) => e.attemptId === a.id).map(toEvidence) : [];
    const scores: RubricScore[] = a ? sc.filter((s) => s.attemptId === a.id).map((s) => ({ criterion: s.criterion, level: s.level, scorer: s.scorer, createdAt: s.createdAt })) : [];
    // A "passed" attempt stays passed (e.g. a diagnostic skip); otherwise re-evaluate from its evidence.
    const evaluation = evaluateGate(g, evidence, scores);
    const status: GateStatus = a?.status === "passed" ? "passed" : a?.status === "failed" ? "failed" : evaluation.status;
    out.set(g.id, { status, evaluation, openAttemptId: a && a.status === "pending_evidence" ? a.id : null, lastAttemptId: a?.id ?? null, selfAssessed: evaluation.rubric.selfAssessed });
  }
  return out;
}

function toEvidence(e: typeof attemptEvidence.$inferSelect): EvidenceItem {
  return { kind: e.kind, ref: e.ref, quiz: e.quizId, passed: e.passed, verified: e.verified, url: e.url, createdAt: e.createdAt };
}

export async function openRemediationGates(userId: string) {
  const rows = await getDb().select({ gateId: remediationPlans.gateId, reattemptAfter: remediationPlans.reattemptAfter }).from(remediationPlans)
    .where(and(eq(remediationPlans.userId, userId), eq(remediationPlans.status, "open")));
  return rows;
}

/** Returns the open attempt for a gate, creating one. Refuses while a remediation wait is running (B.6). */
export async function openAttempt(userId: string, gateId: string, contentVersion: string, source: "manual" | "server" | "diagnostic" = "manual") {
  const db = getDb();
  const wait = (await openRemediationGates(userId)).find((r) => r.gateId === gateId && r.reattemptAfter && r.reattemptAfter > new Date());
  if (wait) return { error: "REATTEMPT_WAIT" as const, until: wait.reattemptAfter! };
  const last = (await db.select().from(attempts).where(and(eq(attempts.userId, userId), eq(attempts.gateId, gateId), ne(attempts.status, "practice")))
    .orderBy(desc(attempts.createdAt), desc(attempts.id)).limit(1))[0];
  if (last?.status === "pending_evidence") return { id: last.id };
  if (last?.status === "passed") return { error: "ALREADY_PASSED" as const };
  const [r] = await db.insert(attempts).values({ userId, gateId, source, status: "pending_evidence", contentVersion }).$returningId();
  return { id: r!.id };
}

export async function addEvidence(attemptId: number, e: { kind: EvidenceItem["kind"]; url?: string | null; commitSha?: string | null; passed: boolean | null; verified: boolean; ref?: string | null; quiz?: string | null; method: string }) {
  await getDb().insert(attemptEvidence).values({ attemptId, kind: e.kind, passed: e.passed, ref: e.ref ?? null, quizId: e.quiz ?? null, url: e.url ?? null,
    commitSha: e.commitSha ?? null, verified: e.verified, verifiedAt: e.verified ? new Date() : null, verifyMethod: e.method });
}

export async function addRubricScores(attemptId: number, scorerUserId: string, scorer: "self" | "reviewer", scores: { criterion: string; level: RubricScore["level"]; note?: string | undefined }[]) {
  if (!scores.length) return;
  await getDb().insert(rubricScores).values(scores.map((s) => ({ attemptId, criterion: s.criterion, level: s.level, scorer, scorerUserId, note: s.note ?? null })));
}

/** Re-evaluates an attempt, persists its status, opens remediation on failure and closes it on pass. */
export async function settleAttempt(userId: string, attemptId: number, gate: Gate, remediation: (g: Gate, now: Date) => { track: string; note: string; reattemptAfter: Date | null }) {
  const db = getDb();
  const ev = (await db.select().from(attemptEvidence).where(eq(attemptEvidence.attemptId, attemptId))).map(toEvidence);
  const sc = (await db.select().from(rubricScores).where(eq(rubricScores.attemptId, attemptId))).map((s) => ({ criterion: s.criterion, level: s.level, scorer: s.scorer, createdAt: s.createdAt }));
  const evaluation = evaluateGate(gate, ev, sc);
  const status = evaluation.status === "not_started" ? "pending_evidence" : evaluation.status;
  await db.update(attempts).set({ status, passed: status === "passed" ? true : status === "failed" ? false : null }).where(eq(attempts.id, attemptId));
  if (status === "failed") {
    const r = remediation(gate, new Date());
    await db.insert(remediationPlans).values({ userId, gateId: gate.id, failedAttemptId: attemptId, trackJson: { track: r.track, note: r.note }, reattemptAfter: r.reattemptAfter });
  }
  if (status === "passed") {
    await db.update(remediationPlans).set({ status: "done" }).where(and(eq(remediationPlans.userId, userId), eq(remediationPlans.gateId, gate.id)));
    for (const s of gate.skills ?? []) await db.insert(userSkillState).values({ userId, skillId: s, level: "verified" }).onDuplicateKeyUpdate({ set: { level: "verified" } });
  }
  return { status, evaluation };
}

export async function recordPractice(userId: string, gateId: string, exerciseId: string, contentVersion: string, passed: boolean, result: unknown) {
  const [r] = await getDb().insert(attempts).values({ userId, gateId, exerciseId, source: "browser", status: "practice", passed, resultJson: result, contentVersion }).$returningId();
  return r!.id;
}

export async function hintsUsed(userId: string, exerciseId: string) {
  const row = (await getDb().select({ n: sql<number>`COALESCE(MAX(${attempts.hintsUsed}), 0)` }).from(attempts)
    .where(and(eq(attempts.userId, userId), eq(attempts.exerciseId, exerciseId))))[0];
  return Number(row?.n ?? 0);
}

/** Records a hint reveal honestly on the learner's practice attempt for that exercise (E.3 §6). */
export async function revealHint(userId: string, gateId: string, exerciseId: string, contentVersion: string) {
  const db = getDb();
  const used = await hintsUsed(userId, exerciseId);
  const next = Math.min(used + 1, 3);
  const last = (await db.select().from(attempts).where(and(eq(attempts.userId, userId), eq(attempts.exerciseId, exerciseId), eq(attempts.status, "practice")))
    .orderBy(desc(attempts.id)).limit(1))[0];
  if (last) await db.update(attempts).set({ hintsUsed: next }).where(eq(attempts.id, last.id));
  else await db.insert(attempts).values({ userId, gateId, exerciseId, source: "browser", status: "practice", passed: null, resultJson: { hintOnly: true }, hintsUsed: next, contentVersion });
  return next;
}

// ---- cards / FSRS ----
export async function existingCardFronts(userId: string, weekId: string) {
  return new Set((await getDb().select({ front: cards.front }).from(cards).where(and(eq(cards.userId, userId), eq(cards.weekId, weekId)))).map((r) => r.front));
}
export async function insertCards(rows: (typeof cards.$inferInsert)[]) {
  if (rows.length) await getDb().insert(cards).values(rows);
}
export async function getCard(id: number) {
  return (await getDb().select().from(cards).where(eq(cards.id, id)).limit(1))[0];
}
export async function dueCards(userId: string, now: Date, weekIds: string[]) {
  if (!weekIds.length) return [];
  return getDb().select({ id: cards.id, front: cards.front, back: cards.back, weekId: cards.weekId, dueAt: cards.dueAt }).from(cards)
    .where(and(eq(cards.userId, userId), lte(cards.dueAt, now), eq(cards.suspended, false), inArray(cards.weekId, weekIds))).orderBy(asc(cards.dueAt)).limit(100);
}
export async function cardCounts(userId: string) {
  const r = (await getDb().select({ n: sql<number>`COUNT(*)` }).from(cards).where(eq(cards.userId, userId)))[0];
  return Number(r?.n ?? 0);
}
export async function saveReview(card: typeof cards.$inferSelect, rating: number, state: unknown, due: Date, elapsedDays: number, scheduledDays: number) {
  const db = getDb();
  await db.transaction(async (tx) => {
    await tx.update(cards).set({ fsrsState: state, dueAt: due }).where(eq(cards.id, card.id));
    await tx.insert(cardReviews).values({ cardId: card.id, userId: card.userId, rating, stateBefore: card.fsrsState as object, elapsedDays, scheduledDays });
  });
}
export async function reviewsSince(userId: string, since: Date) {
  return getDb().select({ rating: cardReviews.rating }).from(cardReviews).where(and(eq(cardReviews.userId, userId), gte(cardReviews.reviewedAt, since)));
}

// ---- time logs ----
export async function addTimeLog(userId: string, weekId: string, minutes: number, category: string, loggedOn: Date, source: "timer" | "manual") {
  await getDb().insert(timeLogs).values({ userId, weekId, minutes, category, loggedOn, source });
}
export async function minutesByWeek(userId: string) {
  const rows = await getDb().select({ weekId: timeLogs.weekId, minutes: sql<number>`SUM(${timeLogs.minutes})` }).from(timeLogs).where(eq(timeLogs.userId, userId)).groupBy(timeLogs.weekId);
  return new Map(rows.map((r) => [r.weekId, Number(r.minutes)]));
}

// ---- diagnostic ----
export async function latestDiagnostic(userId: string) {
  return (await getDb().select().from(diagnosticSessions).where(eq(diagnosticSessions.userId, userId)).orderBy(desc(diagnosticSessions.id)).limit(1))[0];
}
export async function startDiagnostic(userId: string) {
  const [r] = await getDb().insert(diagnosticSessions).values({ userId, stateJson: { answers: {}, index: 0 } }).$returningId();
  return r!.id;
}
export async function saveDiagnostic(id: number, state: unknown, pausedMs: number, complete: unknown | null) {
  await getDb().update(diagnosticSessions).set({ stateJson: state, pausedMs, ...(complete ? { completedAt: new Date(), resultJson: complete } : {}) }).where(eq(diagnosticSessions.id, id));
}

// ---- sources ----
export async function sourcesByUrl(urls: string[]) {
  if (!urls.length) return [];
  return getDb().select().from(sources).where(inArray(sources.url, urls));
}

export async function attemptById(id: number) {
  return (await getDb().select().from(attempts).where(eq(attempts.id, id)).limit(1))[0];
}
