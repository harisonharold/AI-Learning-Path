/**
 * Immediate server-side summary computed at upload time from the full sample set (AT-15). It mirrors numpy's default
 * "linear" percentile method exactly; a test checks it against the committed numpy fixture. Bootstrap CIs, the
 * histogram and the CDF are added afterwards by the stats job (worker-py).
 */
export interface CoreSummary { n: number; mean: number; stdev: number; min: number; max: number; p50: number; p95: number; p99: number }

export function percentileSorted(sorted: ArrayLike<number>, p: number): number {
  const n = sorted.length;
  if (n === 0) throw new Error("empty");
  const h = (n - 1) * (p / 100); // same operation order as numpy, so the float result matches
  const lo = Math.floor(h);
  const hi = Math.min(lo + 1, n - 1);
  const a = sorted[lo]!;
  const b = sorted[hi]!;
  // numpy's _lerp form, so results match bit-for-bit in the common case.
  const t = h - lo;
  const diff = b - a;
  return t >= 0.5 ? b - diff * (1 - t) : a + diff * t;
}

export function describe(values: readonly number[]): CoreSummary {
  const n = values.length;
  if (n === 0) throw new Error("no samples");
  const sorted = Float64Array.from(values).sort();
  let sum = 0;
  for (const v of sorted) sum += v;
  const mean = sum / n;
  let ss = 0;
  for (const v of sorted) ss += (v - mean) ** 2;
  return {
    n, mean, stdev: n > 1 ? Math.sqrt(ss / (n - 1)) : 0, min: sorted[0]!, max: sorted[n - 1]!,
    p50: percentileSorted(sorted, 50), p95: percentileSorted(sorted, 95), p99: percentileSorted(sorted, 99),
  };
}

/** Deterministic stride subsample (keeps original order) used to cap what is sent to the stats job. */
export function strideSample(values: readonly number[], max: number): number[] {
  if (values.length <= max) return [...values];
  const step = values.length / max;
  return Array.from({ length: max }, (_, i) => values[Math.floor(i * step)]!);
}

/** Max-preserving downsampling for the GPU timeline (DATA_MODEL: 50k points per run). */
export function downsampleMax<T extends { t_ms: number; util_pct: number; mem_mb: number; power_w?: number | undefined }>(points: readonly T[], max: number): T[] {
  if (points.length <= max) return [...points];
  const size = Math.ceil(points.length / max);
  const out: T[] = [];
  for (let i = 0; i < points.length; i += size) {
    const bucket = points.slice(i, i + size);
    const first = bucket[0]!;
    out.push({
      ...first,
      util_pct: Math.max(...bucket.map((p) => p.util_pct)),
      mem_mb: Math.max(...bucket.map((p) => p.mem_mb)),
      ...(first.power_w !== undefined ? { power_w: Math.max(...bucket.map((p) => p.power_w ?? 0)) } : {}),
    });
  }
  return out;
}
