/** AT-19 (rule part) and F.5 rules: report readiness, pre-registration immutability, diffs and confounder warnings. */
import { describe, expect, it } from "vitest";
import { confounderWarnings, diff, flatten, type Prereg, preregChangeError, reportReadiness, type RunFacts } from "../internal/rules.ts";

const prereg: Prereg = { primary_metric: "latency_ms", baseline_desc: "b", stopping_rule: "s", min_repetitions: 3 };
let id = 0;
const run = (configId: number, over: Partial<RunFacts> = {}): RunFacts => ({
  id: ++id, configId, configName: `c${configId}`, status: "ok", isBaseline: configId === 1, isWarmup: false, isMock: false, envFingerprint: "e", metrics: ["latency_ms"], ...over,
});
const many = (n: number, configId: number, over: Partial<RunFacts> = {}) => Array.from({ length: n }, () => run(configId, over));

describe("AT-19: report readiness", () => {
  it("needs a pre-registration", () => {
    const r = reportReadiness(null, false, many(5, 1));
    expect(r.ready).toBe(false);
    expect(r.reasons[0]).toMatch(/Pre-register/);
  });
  it("needs a baseline with enough counting runs and another config with as many", () => {
    expect(reportReadiness(prereg, false, many(3, 2)).reasons.join()).toMatch(/No baseline run yet/);
    expect(reportReadiness(prereg, false, [...many(2, 1), ...many(3, 2)]).reasons.join()).toMatch(/baseline has 2 of 3/);
    expect(reportReadiness(prereg, false, many(3, 1)).reasons.join()).toMatch(/No other config/);
    const ok = reportReadiness(prereg, false, [...many(3, 1), ...many(3, 2), ...many(1, 3)]);
    expect(ok).toMatchObject({ ready: true, baselineConfigId: 1, candidateConfigIds: [2] });
  });
  it("failed, warm-up and sample runs don't count, and runs without the primary metric don't count", () => {
    const runs = [...many(3, 1), ...many(2, 2), run(2, { status: "failed" }), run(2, { isWarmup: true }), run(2, { isMock: true }), run(2, { metrics: ["throughput"] })];
    expect(reportReadiness(prereg, false, runs).ready).toBe(false);
  });
  it("one baseline config only", () => {
    expect(reportReadiness(prereg, false, [...many(3, 1), ...many(3, 2, { isBaseline: true })]).reasons.join()).toMatch(/more than one config/);
  });
  it("a sample-data project is never reportable", () => {
    expect(reportReadiness(prereg, true, [...many(3, 1), ...many(3, 2)]).reasons.join()).toMatch(/sample data never goes into reports/);
  });
});

describe("F.5 pre-registration is immutable", () => {
  const set = { preregisteredAt: new Date() };
  it("allows anything before pre-registration", () => expect(preregChangeError({ preregisteredAt: null }, { prereg: {}, hypothesis: "x" })).toBeNull());
  it("refuses changes to the pre-registration, hypothesis or plan after it", () => {
    expect(preregChangeError(set, { prereg: {} })).toMatch(/amendment/);
    expect(preregChangeError(set, { hypothesis: "x" })).toMatch(/amendment/);
    expect(preregChangeError(set, { planMd: "x" })).toMatch(/amendment/);
    expect(preregChangeError(set, {})).toBeNull();
  });
});

describe("config/env diffs and confounder warnings", () => {
  it("flattens nested configs and lists only changed fields", () => {
    expect(flatten({ a: { b: 1, c: [1, 2] }, d: "x" })).toEqual({ "a.b": 1, "a.c": [1, 2], d: "x" });
    expect(diff({ a: { b: 1 }, x: 1 }, { a: { b: 2 }, x: 1, y: true })).toEqual([{ field: "a.b", baseline: 1, candidate: 2 }, { field: "y", baseline: null, candidate: true }]);
  });
  it("warns about several changes at once, different environments, dirty trees and missing digests", () => {
    const env = { cpu: "x", libs: { torch: "2.9" }, container_digest: `sha256:${"a".repeat(64)}`, git_sha: "a".repeat(40) };
    expect(confounderWarnings({ config: { b: 1 }, env }, { config: { b: 8 }, env: { ...env, git_sha: "b".repeat(40) } })).toEqual([]);
    const w = confounderWarnings({ config: { b: 1, t: 1 }, env }, { config: { b: 8, t: 2 }, env: { ...env, libs: { torch: "2.10" }, git_dirty: true, container_digest: null } });
    expect(w.join("\n")).toMatch(/2 config values differ/);
    expect(w.join("\n")).toMatch(/Different environment: container_digest, libs.torch/);
    expect(w.join("\n")).toMatch(/git dirty/);
    expect(w.join("\n")).toMatch(/No container digest/);
  });
});
