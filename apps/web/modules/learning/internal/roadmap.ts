/**
 * Roadmap locks (pure). A week unlocks only when every prerequisite skill is passed, and weeks >= 18 also need the
 * W12 and W15 exams (G §6.1). The input type deliberately has no time/hours field: hours never unlock (AT-06).
 */
import type { Curriculum, RiWeek } from "./content-schema.ts";
import type { GateStatus } from "./gates.ts";

export type WeekState = "locked" | "available" | "in_progress" | "remediation" | "passed";
export interface RoadmapInput {
  curriculum: Curriculum;
  mode: "RI" | "ACC";
  gateStatus: ReadonlyMap<string, GateStatus>;
  openRemediationGates: ReadonlySet<string>;
}
export interface WeekView {
  id: string;
  ordinal: number;
  title: string;
  riWeekIds: string[];
  gateIds: string[];
  state: WeekState;
  lockedBy: string[];
  hardware: string[];
}
export interface Roadmap { weeks: WeekView[]; skills: Record<string, "passed" | "not_passed">; currentWeekId: string | null; currentRiOrdinal: number | null }

const gateSkills = (w: RiWeek, gateId: string) => w.gates.find((g) => g.id === gateId)?.skills ?? w.skills;

export function skillStates(c: Curriculum, gateStatus: ReadonlyMap<string, GateStatus>) {
  const passed: Record<string, "passed" | "not_passed"> = {};
  for (const s of c.skills) {
    const covering = c.ri_weeks.flatMap((w) => w.gates.filter((g) => gateSkills(w, g.id).includes(s.id)));
    passed[s.id] = covering.length > 0 && covering.every((g) => gateStatus.get(g.id) === "passed") ? "passed" : "not_passed";
  }
  return passed;
}

function riWeekState(c: Curriculum, w: RiWeek, input: RoadmapInput, skills: Record<string, string>): { state: WeekState; lockedBy: string[] } {
  const statuses = w.gates.map((g) => input.gateStatus.get(g.id) ?? "not_started");
  if (statuses.every((s) => s === "passed")) return { state: "passed", lockedBy: [] };
  const prereqs = new Set(c.skill_edges.filter(([, to]) => w.skills.includes(to)).map(([from]) => from).filter((s) => !w.skills.includes(s)));
  const lockedBy = [...prereqs].filter((s) => skills[s] !== "passed").map((s) => `skill: ${c.skills.find((x) => x.id === s)?.name ?? s}`);
  if (w.ordinal >= c.advanced_from_ri_week) {
    for (const g of c.advanced_requires_gates) if (input.gateStatus.get(g) !== "passed") lockedBy.push(`gate: ${g}`);
  }
  if (lockedBy.length) return { state: "locked", lockedBy };
  if (w.gates.some((g) => input.openRemediationGates.has(g.id))) return { state: "remediation", lockedBy: [] };
  if (statuses.some((s) => s !== "not_started")) return { state: "in_progress", lockedBy: [] };
  return { state: "available", lockedBy: [] };
}

export function computeRoadmap(input: RoadmapInput): Roadmap {
  const c = input.curriculum;
  const skills = skillStates(c, input.gateStatus);
  const ri = [...c.ri_weeks].sort((a, b) => a.ordinal - b.ordinal);
  const riViews = new Map(ri.map((w) => {
    const s = riWeekState(c, w, input, skills);
    const view: WeekView = { id: w.id, ordinal: w.ordinal, title: w.title, riWeekIds: [w.id], gateIds: w.gates.map((g) => g.id), hardware: [w.hardware], ...s };
    return [w.id, view] as [string, WeekView];
  }));
  let weeks: WeekView[];
  if (input.mode === "RI") weeks = ri.map((w) => riViews.get(w.id)!);
  else {
    weeks = [...c.acc_weeks].sort((a, b) => a.ordinal - b.ordinal).map((a) => {
      const parts = a.ri.map((id) => riViews.get(id)!);
      const state: WeekState = parts.every((p) => p.state === "passed") ? "passed"
        : parts.every((p) => p.state === "locked" || p.state === "passed") && parts.some((p) => p.state === "locked") ? "locked"
        : parts.some((p) => p.state === "remediation") ? "remediation"
        : parts.some((p) => p.state === "in_progress" || p.state === "passed") ? "in_progress" : "available";
      return { id: a.id, ordinal: a.ordinal, title: a.title, riWeekIds: a.ri, gateIds: parts.flatMap((p) => p.gateIds), hardware: [...new Set(parts.flatMap((p) => p.hardware))],
        state, lockedBy: state === "locked" ? [...new Set(parts.flatMap((p) => p.lockedBy))] : [] };
    });
  }
  const current = weeks.find((w) => w.state !== "passed" && w.state !== "locked") ?? null;
  const currentRiOrdinal = current ? Math.min(...current.riWeekIds.map((id) => riViews.get(id)!.ordinal)) : null;
  return { weeks, skills, currentWeekId: current?.id ?? null, currentRiOrdinal };
}
