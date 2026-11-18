/**
 * Pure research rules (F.5): pre-registration, the report gate (AT-19), config/env diffs and confounder warnings.
 * No I/O here so every rule is unit-tested directly.
 */

export class ResearchError extends Error {
  constructor(public code: "NOT_FOUND" | "FORBIDDEN" | "INVALID" | "NOT_AVAILABLE" | "CONFLICT", message: string, public details: Record<string, unknown> = {}) {
    super(message);
  }
}

export interface Prereg { primary_metric: string; baseline_desc: string; stopping_rule: string; min_repetitions: number }

export interface RunFacts {
  id: number;
  configId: number;
  configName: string;
  status: "ok" | "failed" | "invalid";
  isBaseline: boolean;
  isWarmup: boolean;
  isMock: boolean;
  envFingerprint: string;
  metrics: string[];
}

export const CONFOUNDER_CHECKLIST = [
  "Hardware differences (CPU/GPU model, memory)",
  "Clock speed and thermal throttling",
  "Background load on the machine",
  "Cache state (cold vs warm runs)",
  "Dataset or trace version",
  "Tokenizer version",
  "Random seeds",
] as const;

/** Runs that count for statistics: ok, not warm-up, not sample data. Failed runs are still listed in reports. */
export const counts = (r: RunFacts) => r.status === "ok" && !r.isWarmup && !r.isMock;

export interface Readiness {
  ready: boolean;
  reasons: string[];
  baselineConfigId: number | null;
  candidateConfigIds: number[];
  repetitions: Record<number, number>;
}

/** AT-19: a report can be generated only with a pre-registration, a baseline config with at least
 * `min_repetitions` counting runs, and at least one other config that also has that many. */
export function reportReadiness(prereg: Prereg | null, isMockProject: boolean, runs: RunFacts[]): Readiness {
  const reasons: string[] = [];
  const reps: Record<number, number> = {};
  if (isMockProject) reasons.push("This is a sample-data project; sample data never goes into reports.");
  if (!prereg) {
    reasons.push("Pre-register the hypothesis, primary metric, baseline and stopping rule first.");
    return { ready: false, reasons, baselineConfigId: null, candidateConfigIds: [], repetitions: reps };
  }
  const metricRuns = runs.filter((r) => counts(r) && r.metrics.includes(prereg.primary_metric));
  for (const r of metricRuns) reps[r.configId] = (reps[r.configId] ?? 0) + 1;
  const baselineConfigs = [...new Set(runs.filter((r) => r.isBaseline && !r.isMock).map((r) => r.configId))];
  let baselineConfigId: number | null = null;
  if (baselineConfigs.length === 0) reasons.push("No baseline run yet: mark the runs of your baseline config as baseline.");
  else if (baselineConfigs.length > 1) reasons.push("Baseline runs belong to more than one config; a project has one baseline config.");
  else {
    baselineConfigId = baselineConfigs[0]!;
    const n = reps[baselineConfigId] ?? 0;
    if (n < prereg.min_repetitions) reasons.push(`The baseline has ${n} of ${prereg.min_repetitions} required ok, non-warm-up runs with ${prereg.primary_metric}.`);
  }
  const candidateConfigIds = Object.entries(reps)
    .map(([id, n]) => [Number(id), n] as const)
    .filter(([id, n]) => id !== baselineConfigId && n >= prereg.min_repetitions)
    .map(([id]) => id);
  if (candidateConfigIds.length === 0) reasons.push(`No other config has ${prereg.min_repetitions} ok, non-warm-up runs with ${prereg.primary_metric} to compare against the baseline.`);
  return { ready: reasons.length === 0, reasons, baselineConfigId, candidateConfigIds, repetitions: reps };
}

export function flatten(v: unknown, prefix = "", out: Record<string, unknown> = {}): Record<string, unknown> {
  if (v !== null && typeof v === "object" && !Array.isArray(v)) {
    const entries = Object.entries(v as Record<string, unknown>);
    if (entries.length === 0 && prefix) out[prefix] = {};
    for (const [k, x] of entries) flatten(x, prefix ? `${prefix}.${k}` : k, out);
  } else if (prefix) out[prefix] = v;
  return out;
}

export interface DiffRow { field: string; baseline: unknown; candidate: unknown }

export function diff(a: unknown, b: unknown): DiffRow[] {
  const fa = flatten(a);
  const fb = flatten(b);
  return [...new Set([...Object.keys(fa), ...Object.keys(fb)])]
    .sort()
    .filter((k) => JSON.stringify(fa[k]) !== JSON.stringify(fb[k]))
    .map((k) => ({ field: k, baseline: fa[k] ?? null, candidate: fb[k] ?? null }));
}

export interface EnvLike {
  cpu?: string; cpu_count?: number; os?: string; python?: string; libs?: Record<string, string>;
  git_sha?: string | null; git_dirty?: boolean; container_digest?: string | null; gpu?: { name: string; driver: string; cuda: string | null }[];
}

/** Confounder warnings shown next to every comparison (F.5 "change one variable at a time"). */
export function confounderWarnings(base: { config: unknown; env: EnvLike }, cand: { config: unknown; env: EnvLike }): string[] {
  const w: string[] = [];
  const configChanges = diff(base.config, cand.config);
  if (configChanges.length > 1) w.push(`${configChanges.length} config values differ (${configChanges.map((c) => c.field).join(", ")}); F.5 asks for one change at a time.`);
  const envChanges = diff({ ...base.env, git_sha: null, git_dirty: null }, { ...cand.env, git_sha: null, git_dirty: null });
  if (envChanges.length) w.push(`Different environment: ${envChanges.map((c) => c.field).join(", ")}. No speed-up can be claimed across environments.`);
  if (base.env.git_dirty || cand.env.git_dirty) w.push("At least one run had uncommitted changes (git dirty); the exact code is not reproducible.");
  if (!base.env.container_digest || !cand.env.container_digest) w.push("No container digest recorded; system libraries may differ between runs.");
  return w;
}

/** Validates a pre-registration change. Returns the error message or null. */
export function preregChangeError(existing: { preregisteredAt: Date | null }, patch: { prereg?: unknown; hypothesis?: unknown; planMd?: unknown }): string | null {
  if (!existing.preregisteredAt) return null;
  if (patch.prereg !== undefined) return "The pre-registration is fixed once saved. Add an amendment instead; amendments are appended with a timestamp.";
  if (patch.hypothesis !== undefined) return "The hypothesis is part of the pre-registration and can no longer change. Add an amendment instead.";
  if (patch.planMd !== undefined) return "The plan can no longer be edited after pre-registration. Add an amendment instead.";
  return null;
}
