/** Remediation, learning meter and finish estimate (pure). */
import type { Gate } from "./content-schema.ts";

export function remediationFor(gate: Gate, now: Date) {
  const r = gate.remediation;
  const track = r?.track ?? "Review the week's lesson and must-know cards, then redo the requirement that failed.";
  const reattemptAfter = r && r.reattempt_after_hours > 0 ? new Date(now.getTime() + r.reattempt_after_hours * 3600_000) : null;
  return { track, note: r?.reattempt_note ?? "You can re-attempt when ready.", reattemptAfter };
}

/**
 * Learning-progress meter (C.6): gates passed / gates in the chosen mode, and observed retention from FSRS reviews
 * (share of reviews in the last 30 days rated Hard or better). Mock records are excluded by the caller's queries.
 */
export function learningMeter(input: { gatesInMode: number; gatesPassed: number; reviews30d: { rating: number }[]; passedGateIds: string[] }) {
  const recalled = input.reviews30d.filter((r) => r.rating >= 2).length;
  const retention = input.reviews30d.length ? recalled / input.reviews30d.length : null;
  return {
    meter: "learning_progress" as const,
    gatesPassed: input.gatesPassed,
    gatesInMode: input.gatesInMode,
    retention,
    reviewsCounted: input.reviews30d.length,
    formula: "progress = gates passed ÷ gates in your mode; retention = reviews rated Hard/Good/Easy ÷ all reviews in the last 30 days (target 0.9)",
    evidence: input.passedGateIds,
  };
}

/**
 * Finish estimate (G §6.1): planning estimate until two weeks are passed, then from your own minutes per passed gate.
 * Uses logged time for the calendar only; time never unlocks anything.
 */
export function estimateFinish(input: { plannedHours: number; hoursPerWeek: number; gatesInMode: number; gatesPassed: number; weeksPassed: number; minutesOnPassedGates: number; now: Date }) {
  const day = 86_400_000;
  if (input.weeksPassed < 2 || input.gatesPassed === 0) {
    const weeks = Math.ceil(input.plannedHours / input.hoursPerWeek);
    return { method: "planning" as const, weeks, finish: new Date(input.now.getTime() + weeks * 7 * day), formula: `ceil(${input.plannedHours} h ÷ ${input.hoursPerWeek} h/week) = ${weeks} weeks (planning estimate until week 2 is passed)` };
  }
  const perGate = input.minutesOnPassedGates / input.gatesPassed;
  const remaining = input.gatesInMode - input.gatesPassed;
  const weeks = Math.ceil((perGate * remaining) / 60 / input.hoursPerWeek);
  return { method: "actual" as const, weeks, finish: new Date(input.now.getTime() + weeks * 7 * day),
    formula: `ceil(${Math.round(perGate)} min per passed gate × ${remaining} gates left ÷ 60 ÷ ${input.hoursPerWeek} h/week) = ${weeks} weeks` };
}
