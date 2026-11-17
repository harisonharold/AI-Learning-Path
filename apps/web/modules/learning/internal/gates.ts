/**
 * Gate evaluation (pure). Rules:
 * - Only counting evidence (atlas-lab, server-graded, GitHub-API-verified, reviewer) satisfies an objective requirement,
 *   and only when verified. Browser practice checks are not evidence at all (D-15, X-13).
 * - report/recording requirements are satisfied by an artifact link; the rubric scores them.
 * - Rubric pass rule (G §7): no criterion "missing", at least half "competent" or better. ai_suggested scores never count;
 *   self scores count but the result is labelled self-assessed (Q6).
 * - Hours logged are not an input to anything here (AT-06).
 */
import { COUNTING_KINDS, type EvidenceKind, type Gate, type RequiredEvidence } from "./content-schema.ts";

export interface EvidenceItem {
  kind: EvidenceKind;
  ref?: string | null;
  quiz?: string | null;
  passed: boolean | null;
  verified: boolean;
  url?: string | null;
  createdAt: Date;
}
export type Level = "missing" | "partial" | "competent" | "strong";
export type Scorer = "self" | "reviewer" | "auto" | "ai_suggested";
export interface RubricScore { criterion: string; level: Level; scorer: Scorer; createdAt: Date }
export type GateStatus = "not_started" | "pending_evidence" | "passed" | "failed";

export interface RequirementResult { requirement: RequiredEvidence; satisfied: boolean; failed: boolean; reason: string }
export interface GateEvaluation {
  status: GateStatus;
  requirements: RequirementResult[];
  rubric: { required: boolean; complete: boolean; passes: boolean; selfAssessed: boolean; byCriterion: Record<string, Level | null> } ;
  missing: string[];
}

const matches = (r: RequiredEvidence, e: EvidenceItem) =>
  e.kind === r.kind && (r.kind !== "runner_result" || e.ref === r.ref) && (r.kind !== "server_graded" || e.quiz === r.quiz);

export function latest<T extends { createdAt: Date }>(items: T[]): T | undefined {
  return items.reduce<T | undefined>((a, b) => (!a || b.createdAt >= a.createdAt ? b : a), undefined);
}

export function evaluateRequirement(r: RequiredEvidence, evidence: EvidenceItem[]): RequirementResult {
  const e = latest(evidence.filter((x) => matches(r, x)));
  if (!e) return { requirement: r, satisfied: false, failed: false, reason: "not submitted" };
  if (COUNTING_KINDS.includes(r.kind)) {
    if (!e.verified) return { requirement: r, satisfied: false, failed: false, reason: "submitted, not yet verified" };
    if (e.passed === true) return { requirement: r, satisfied: true, failed: false, reason: "passed" };
    if (e.passed === false) return { requirement: r, satisfied: false, failed: true, reason: "failed" };
    return { requirement: r, satisfied: false, failed: false, reason: "no result yet" };
  }
  // report / recording: an artifact must exist; quality is judged by the rubric.
  return e.url ? { requirement: r, satisfied: true, failed: false, reason: "artifact linked" } : { requirement: r, satisfied: false, failed: false, reason: "no link" };
}

export function evaluateRubric(criteria: string[], scores: RubricScore[]) {
  const byCriterion: Record<string, Level | null> = {};
  let selfAssessed = false;
  for (const c of criteria) {
    const s = latest(scores.filter((x) => x.criterion === c && x.scorer !== "ai_suggested"));
    byCriterion[c] = s?.level ?? null;
    if (s?.scorer === "self") selfAssessed = true;
  }
  const levels = Object.values(byCriterion);
  const complete = criteria.length > 0 && levels.every((l) => l !== null);
  const good = levels.filter((l) => l === "competent" || l === "strong").length;
  const passes = complete && !levels.includes("missing") && good * 2 >= criteria.length;
  return { required: criteria.length > 0, complete, passes, selfAssessed, byCriterion };
}

export function evaluateGate(gate: Gate, evidence: EvidenceItem[], scores: RubricScore[]): GateEvaluation {
  const requirements = gate.required_evidence.map((r) => evaluateRequirement(r, evidence));
  const rubric = evaluateRubric((gate.rubric ?? []).map((c) => c.criterion), scores);
  const missing = requirements.filter((r) => !r.satisfied).map((r) => `${r.requirement.label} (${r.reason})`);
  if (rubric.required && !rubric.complete) missing.push("Rubric scores for every criterion");
  let status: GateStatus;
  if (evidence.length === 0 && scores.length === 0) status = "not_started";
  else if (requirements.some((r) => r.failed) || (rubric.required && rubric.complete && !rubric.passes)) status = "failed";
  else if (requirements.every((r) => r.satisfied) && (!rubric.required || rubric.passes)) status = "passed";
  else status = "pending_evidence";
  return { status, requirements, rubric, missing };
}
