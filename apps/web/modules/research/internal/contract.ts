import { createHash } from "node:crypto";
import { z } from "zod";

/**
 * Upload contracts (FR-13, FR-14, D §"Benchmark upload contract").
 * This file is the single source: `packages/contracts/schemas/*.schema.json` is generated from it
 * (`pnpm contracts:gen`) and a unit test fails if the committed files drift.
 * v1 requires raw samples for every metric; a client summary is accepted only for audit and is never shown as truth
 * (AT-15, D-53).
 */

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
export const MAX_SAMPLES_PER_METRIC = 1_000_000;
export const MAX_GPU_POINTS = 200_000;

const hex64 = z.string().regex(/^[0-9a-f]{64}$/, "must be 64 lowercase hex characters");
const shortText = (max: number) => z.string().min(1).max(max);
const isoDate = z.iso.datetime({ offset: true });
const finite = z.number().refine(Number.isFinite, "must be a finite number");

export const MAX_CONFIG_DEPTH = 8;
export const MAX_CONFIG_BYTES = 64 * 1024;
/** Nesting depth of a JSON value (THREAT T-R3: deep nesting would exhaust the stack in recursive code). */
export function jsonDepth(v: unknown, limit = MAX_CONFIG_DEPTH + 1): number {
  if (v === null || typeof v !== "object") return 0;
  if (limit <= 0) return Infinity;
  let d = 0;
  for (const x of Array.isArray(v) ? v : Object.values(v as Record<string, unknown>)) d = Math.max(d, jsonDepth(x, limit - 1));
  return d + 1;
}
const Config = z.record(z.string().max(200), z.unknown()).superRefine((c, ctx) => {
  // Depth first: the size check serialises the value, which must not run on pathological nesting.
  if (jsonDepth(c) > MAX_CONFIG_DEPTH) ctx.addIssue({ code: "custom", message: `nested more than ${MAX_CONFIG_DEPTH} levels` });
  else if (JSON.stringify(c).length > MAX_CONFIG_BYTES) ctx.addIssue({ code: "custom", message: "larger than 64 KB" });
});

export const Env = z
  .object({
    cpu: shortText(200),
    cpu_count: z.number().int().min(1).max(4096),
    memory_mb: z.number().int().min(1).optional(),
    os: shortText(200),
    python: shortText(50),
    libs: z.record(z.string().min(1).max(100), z.string().max(100)).refine((r) => Object.keys(r).length <= 200, "at most 200 libraries"),
    git_sha: z.string().regex(/^[0-9a-f]{40}$/, "must be a full 40-character commit SHA").nullable(),
    git_dirty: z.boolean().optional(),
    container_digest: z.string().regex(/^sha256:[0-9a-f]{64}$/, "must look like sha256:<64 hex>").nullable(),
    gpu: z
      .array(z.object({ name: shortText(200), memory_mb: z.number().int().min(0), driver: shortText(50), cuda: z.string().max(50).nullable() }).strict())
      .max(16),
    gpu_topology: z.string().max(20_000).optional(),
  })
  .strict();

const Metric = z
  .object({
    name: z.string().regex(/^[a-z][a-z0-9_.]{0,63}$/, "lowercase letters, digits, '_' or '.', starting with a letter"),
    unit: z.string().regex(/^[A-Za-z%/]{1,16}$/, "1-16 letters, '%' or '/'"),
    samples: z.array(finite).min(1).max(MAX_SAMPLES_PER_METRIC),
    summary: z.object({ p50: finite, p95: finite, p99: finite, mean: finite, n: z.number().int().min(0) }).strict().optional(),
  })
  .strict();

const GpuPoint = z
  .object({ t_ms: z.number().int().min(0), util_pct: z.number().min(0).max(100), mem_mb: z.number().min(0), power_w: z.number().min(0).optional() })
  .strict();

export const BenchmarkUpload = z
  .object({
    schema_version: z.literal("1"),
    project_id: z.number().int().positive(),
    config_name: shortText(200),
    config: Config,
    config_hash: hex64,
    env: Env,
    metrics: z.array(Metric).max(32),
    gpu_timeline: z.array(GpuPoint).max(MAX_GPU_POINTS).optional(),
    status: z.enum(["ok", "failed"]),
    failure_note: z.string().max(4000).optional(),
    is_baseline: z.boolean().default(false),
    is_warmup: z.boolean().default(false),
    started_at: isoDate,
    ended_at: isoDate,
    command: z.string().max(2000).optional(),
  })
  .strict()
  .superRefine((u, ctx) => {
    if (u.status === "ok" && u.metrics.length === 0) ctx.addIssue({ code: "custom", path: ["metrics"], message: "an ok run needs at least one metric" });
    if (u.status === "failed" && !u.failure_note?.trim()) ctx.addIssue({ code: "custom", path: ["failure_note"], message: "a failed run needs a failure note" });
    if (Date.parse(u.ended_at) < Date.parse(u.started_at)) ctx.addIssue({ code: "custom", path: ["ended_at"], message: "must not be before started_at" });
    const names = u.metrics.map((m) => m.name);
    names.forEach((n, i) => { if (names.indexOf(n) !== i) ctx.addIssue({ code: "custom", path: ["metrics", i, "name"], message: "duplicate metric name" }); });
  });
export type BenchmarkUpload = z.infer<typeof BenchmarkUpload>;

export const GateResultUpload = z
  .object({
    schema_version: z.literal("1"),
    bundle: z.string().regex(/^atlas-lab:[a-z0-9-]+@[0-9]+$/, "must look like atlas-lab:w01@1"),
    bundle_sha256: hex64,
    results: z
      .array(z.object({ test: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]{0,99}$/), passed: z.boolean(), duration_ms: z.number().min(0), message: z.string().max(2000).optional() }).strict())
      .min(1)
      .max(500),
    docker: z.object({ image_digest: z.string().regex(/^sha256:[0-9a-f]{64}$/), network: z.literal("none") }).strict(),
    env: Env,
    runner_version: shortText(40),
    started_at: isoDate,
    ended_at: isoDate,
  })
  .strict();
export type GateResultUpload = z.infer<typeof GateResultUpload>;

export const RunnerUpload = z.discriminatedUnion("kind", [
  BenchmarkUpload.safeExtend({ kind: z.literal("benchmark") }),
  GateResultUpload.safeExtend({ kind: z.literal("gate_tests") }),
]);

/** Canonical JSON: object keys sorted recursively, no whitespace, undefined dropped. atlas-lab implements the same
 * algorithm (`canonical_json`); both are checked against packages/contracts/fixtures/canonical-json.vectors.json. */
export function canonicalJson(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o).sort().filter((k) => o[k] !== undefined).map((k) => `${JSON.stringify(k)}:${canonicalJson(o[k])}`).join(",")}}`;
}

export const sha256 = (s: string | Buffer) => createHash("sha256").update(s).digest("hex");

export const configHash = (config: Record<string, unknown>) => sha256(canonicalJson(config));

/** Hardware/driver/CUDA/library fingerprint: two runs are "same environment" only if these match (F.5 baseline rule).
 * git_sha is excluded on purpose: the code under test is what an experiment changes. */
export function envFingerprint(env: z.infer<typeof Env>): string {
  return sha256(canonicalJson({ cpu: env.cpu, cpu_count: env.cpu_count, memory_mb: env.memory_mb ?? null, os: env.os, python: env.python, libs: env.libs,
    container_digest: env.container_digest, gpu: env.gpu }));
}
