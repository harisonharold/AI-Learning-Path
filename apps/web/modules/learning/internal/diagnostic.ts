/**
 * Diagnostic scoring (pure). Skill levels from the diagnostic are at most "competent": "verified" needs a passed gate.
 * Skipping: only RI weeks 1-3 (Q5), and only by passing that week's gate with counting evidence (Q23).
 */
import type { Curriculum, DiagItem } from "./content-schema.ts";

export type DiagAnswer = { kind: "mcq"; choice: number | null } | { kind: "short_answer"; text: string; selfLevel: "missing" | "partial" | "competent" | "strong" | null } | { kind: "code"; practicePassed: boolean | null } | { kind: "idk" };
export const MAX_SKIP_ORDINAL = 3;

export function diagnosticSkipAllowed(riOrdinal: number): boolean {
  return riOrdinal >= 1 && riOrdinal <= MAX_SKIP_ORDINAL;
}

export function scoreDiagnostic(items: DiagItem[], answers: Record<string, DiagAnswer>) {
  const perSkill: Record<string, { correct: number; answered: number; idk: number; total: number }> = {};
  for (const i of items) {
    const s = (perSkill[i.skill] ??= { correct: 0, answered: 0, idk: 0, total: 0 });
    s.total++;
    const a = answers[i.id];
    if (!a) continue;
    if (a.kind === "idk") { s.idk++; continue; }
    s.answered++;
    if (i.kind === "mcq" && a.kind === "mcq" && a.choice === i.answer) s.correct++;
    if (i.kind === "short_answer" && a.kind === "short_answer" && (a.selfLevel === "competent" || a.selfLevel === "strong")) s.correct++;
    if (i.kind === "code" && a.kind === "code" && a.practicePassed) s.correct++;
  }
  const levels: Record<string, "not_started" | "developing" | "competent"> = {};
  for (const [k, v] of Object.entries(perSkill)) levels[k] = v.answered + v.idk === 0 ? "not_started" : v.correct / v.total >= 0.7 ? "competent" : "developing";
  const total = Object.values(perSkill).reduce((a, v) => a + v.total, 0);
  const correct = Object.values(perSkill).reduce((a, v) => a + v.correct, 0);
  return { perSkill, levels, overall: total ? correct / total : 0 };
}

/** B.1: RI is designed for ~40 h/week, ACC for ~50 h/week. Fewer hours stretch the calendar; gates never shrink. */
export function recommend(c: Curriculum, overall: number, hoursPerWeek: number) {
  const mode: "RI" | "ACC" = hoursPerWeek >= 50 && overall >= 0.7 ? "ACC" : "RI";
  const weeks = Math.ceil(c.hours_estimate[mode] / hoursPerWeek);
  const reason = mode === "ACC"
    ? `Accelerated: you have ${hoursPerWeek} h/week and scored ${Math.round(overall * 100)}% on the diagnostic.`
    : hoursPerWeek >= 50
      ? `Research-Intensive: the Accelerated plan assumes a strong start (70%+); you scored ${Math.round(overall * 100)}%.`
      : `Research-Intensive: the Accelerated plan needs about 50 h/week; you have ${hoursPerWeek}.`;
  return { mode, weeks, reason, formula: `ceil(${c.hours_estimate[mode]} h planned ÷ ${hoursPerWeek} h/week) = ${weeks} weeks (planning estimate, B.1)` };
}
