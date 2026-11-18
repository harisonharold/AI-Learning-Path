/** Upload contracts (AT-16), canonical JSON parity with atlas-lab, and the TS summary vs numpy (AT-15). */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BenchmarkUpload, canonicalJson, configHash, envFingerprint, GateResultUpload, RunnerUpload, sha256 } from "../internal/contract.ts";
import { contractSchemas } from "../internal/contract-schemas.ts";
import { describe as summarize, downsampleMax, percentileSorted, strideSample } from "../internal/summary.ts";

const C = new URL("../../../../../packages/contracts/", import.meta.url);
const read = (p: string) => JSON.parse(readFileSync(new URL(p, C), "utf8")) as Record<string, unknown>;

describe("JSON Schemas are generated from the Zod contract", () => {
  for (const [name, schema] of Object.entries(contractSchemas())) {
    it(`${name}.schema.json is up to date (run pnpm contracts:gen)`, () => expect(read(`schemas/${name}.schema.json`)).toEqual(schema));
  }
});

describe("AT-16: upload validation", () => {
  it("accepts the valid fixtures", () => {
    expect(BenchmarkUpload.safeParse(read("fixtures/benchmark.valid.json")).success).toBe(true);
    expect(GateResultUpload.safeParse(read("fixtures/gate-result.valid.json")).success).toBe(true);
    expect(RunnerUpload.safeParse({ kind: "benchmark", ...read("fixtures/benchmark.valid.json") }).success).toBe(true);
  });
  it("reports every bad field with its path", () => {
    const f = read("fixtures/benchmark.invalid.json") as { body: unknown; expected_error_paths: string[] };
    const r = BenchmarkUpload.safeParse(f.body);
    expect(r.success).toBe(false);
    const paths = new Set(r.error!.issues.map((i) => i.path.join(".")));
    for (const p of f.expected_error_paths) expect(paths, `missing error at "${p}"`).toContain(p);
  });
  it("cross-field rules: failed runs need a note, ok runs need a metric, times ordered, names unique", () => {
    const v = read("fixtures/benchmark.valid.json") as Record<string, unknown>;
    const bad = (patch: Record<string, unknown>, path: string) => {
      const r = BenchmarkUpload.safeParse({ ...v, ...patch });
      expect(r.success).toBe(false);
      expect(r.error!.issues.map((i) => i.path.join("."))).toContain(path);
    };
    bad({ status: "failed" }, "failure_note");
    bad({ metrics: [] }, "metrics");
    bad({ ended_at: "2026-11-18T09:00:00Z" }, "ended_at");
    const m = (v.metrics as unknown[])[0];
    bad({ metrics: [m, m] }, "metrics.1.name");
    bad({ metrics: [{ ...(m as object), samples: [1, Number.NaN] }] }, "metrics.0.samples.1");
    expect(BenchmarkUpload.safeParse({ ...v, status: "failed", failure_note: "OOM", metrics: [] }).success).toBe(true);
  });
  it("T-R3: deeply nested or huge configs are refused before any recursive processing", () => {
    const v = read("fixtures/benchmark.valid.json") as Record<string, unknown>;
    let deep: Record<string, unknown> = { leaf: 1 };
    for (let i = 0; i < 5000; i++) deep = { n: deep };
    const r = BenchmarkUpload.safeParse({ ...v, config: deep });
    expect(r.success).toBe(false);
    expect(r.error!.issues.some((i) => i.path.join(".") === "config")).toBe(true);
    expect(BenchmarkUpload.safeParse({ ...v, config: { blob: "x".repeat(70_000) } }).success).toBe(false);
  });
  it("a gate result must declare network none", () => {
    const g = read("fixtures/gate-result.valid.json");
    expect(GateResultUpload.safeParse({ ...g, docker: { image_digest: `sha256:${"a".repeat(64)}`, network: "bridge" } }).success).toBe(false);
  });
});

describe("canonical JSON and hashes match the shared vectors (atlas-lab uses the same vectors)", () => {
  const vectors = read("fixtures/canonical-json.vectors.json") as unknown as { input: unknown; canonical: string; sha256: string }[];
  it.each(vectors.map((v, i) => [i, v] as const))("vector %i", (_i, v) => {
    expect(canonicalJson(v.input)).toBe(v.canonical);
    expect(sha256(v.canonical)).toBe(v.sha256);
  });
  it("key order does not change the config hash", () => expect(configHash({ a: 1, b: { c: 2, d: 3 } })).toBe(configHash({ b: { d: 3, c: 2 }, a: 1 })));
  it("the env fingerprint ignores git_sha but not hardware", () => {
    const env = (read("fixtures/benchmark.valid.json") as { env: Parameters<typeof envFingerprint>[0] }).env;
    expect(envFingerprint({ ...env, git_sha: "f".repeat(40) })).toBe(envFingerprint(env));
    expect(envFingerprint({ ...env, cpu_count: 16 })).not.toBe(envFingerprint(env));
  });
});

describe("AT-15 (summary part): the TS summary equals numpy's", () => {
  const f = read("../contracts/fixtures/stats-summary.fixture.json") as { input: { values: number[] }; expected: Record<string, number> };
  it("p50/p95/p99/mean/min/max/stdev match the numpy fixture", () => {
    const s = summarize(f.input.values);
    for (const k of ["p50", "p95", "p99", "min", "max", "n"] as const) expect(s[k]).toBe(f.expected[k]);
    expect(s.mean).toBeCloseTo(f.expected.mean!, 12);
    expect(s.stdev).toBeCloseTo(f.expected.stdev!, 12);
  });
  it("hand-computed linear interpolation", () => {
    const s = Float64Array.from([1, 2, 3, 4]);
    expect(percentileSorted(s, 50)).toBe(2.5);
    expect(percentileSorted(s, 95)).toBeCloseTo(3.85, 12);
  });
  it("stride sampling and GPU downsampling are bounded and keep maxima", () => {
    expect(strideSample(Array.from({ length: 1000 }, (_, i) => i), 100)).toHaveLength(100);
    const pts = Array.from({ length: 1000 }, (_, i) => ({ t_ms: i, util_pct: i === 555 ? 99 : 10, mem_mb: 1 }));
    const d = downsampleMax(pts, 100);
    expect(d).toHaveLength(100);
    expect(Math.max(...d.map((p) => p.util_pct))).toBe(99);
  });
});
