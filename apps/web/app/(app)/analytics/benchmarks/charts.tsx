"use client";
import { useCallback, useMemo } from "react";
import { axis, Chart, DASHES, type Theme } from "@/components/charts/Chart";

export interface RunSeries {
  id: number; label: string; isMock: boolean; startedAt: string | null;
  summary: { n: number; min: number; max: number; p25?: number; p50: number; p75?: number; p95: number; p99: number; mean: number;
    ci_status?: string; ci95?: Record<string, [number, number]>; cdf?: [number, number][]; histogram?: { edges: number[]; counts: number[] } };
  unit: string;
}
export interface ExtraMetric { runId: number; label: string; metric: string; unit: string; p50: number; startedAt: string | null }
export interface GpuSeries { runId: number; label: string; points: { t: number; util: number | null; mem: number | null; power?: number | null }[] }

const fmt = (x: number | undefined | null, d = 4) => (x === undefined || x === null || !Number.isFinite(x) ? "n/a" : Number(x.toPrecision(d)).toString());
const line = (i: number) => ({ type: DASHES[i % DASHES.length], width: 2 });

function Figure({ id, title, summary, children, table }: { id: string; title: string; summary: string; children: React.ReactNode; table: React.ReactNode }) {
  return (
    <figure className="panel space-y-2" aria-labelledby={`${id}-t`}>
      <h3 id={`${id}-t`} className="text-lg">{title}</h3>
      <figcaption className="text-sm" data-chart-summary={id}>{summary}</figcaption>
      {children}
      <details>
        <summary className="cursor-pointer text-sm">Data table: {title}</summary>
        <div className="mt-2 overflow-x-auto">{table}</div>
      </details>
    </figure>
  );
}

/** Empirical CDF from the stats job; until it has run, a coarse CDF from the stored percentiles (labelled). */
function cdfPoints(r: RunSeries): { pts: [number, number][]; approx: boolean } {
  if (r.summary.cdf?.length) return { pts: r.summary.cdf, approx: false };
  const s = r.summary;
  const pts: [number, number][] = [[s.min, 0], ...(s.p25 !== undefined ? [[s.p25, 0.25] as [number, number]] : []), [s.p50, 0.5], ...(s.p75 !== undefined ? [[s.p75, 0.75] as [number, number]] : []), [s.p95, 0.95], [s.p99, 0.99], [s.max, 1]];
  return { pts, approx: true };
}

function seriesOverRuns(items: ExtraMetric[]) {
  const names = [...new Set(items.map((e) => `${e.metric} (${e.unit})`))];
  return names.map((n) => ({ name: n, points: items.filter((e) => `${e.metric} (${e.unit})` === n) }));
}
const overRunsBuild = (items: ExtraMetric[], yName: string) => (t: Theme) => ({
  xAxis: axis(t, "run (in start order)", { type: "category", data: [...new Set(items.map((e) => e.label))] }),
  yAxis: axis(t, yName, { type: "value", scale: true }),
  series: seriesOverRuns(items).map((s, i) => ({ name: s.name, type: "line", lineStyle: line(i), data: s.points.map((p) => p.p50) })),
});

export function BenchmarkCharts({ metric, runs, extras, gpu }: { metric: string; runs: RunSeries[]; extras: ExtraMetric[]; gpu: GpuSeries[] }) {
  const unit = runs[0]?.unit ?? "";
  const cdfs = useMemo(() => runs.map(cdfPoints), [runs]);
  const anyApprox = cdfs.some((c) => c.approx);
  const sorted = [...runs].sort((a, b) => a.summary.p50 - b.summary.p50);
  const lowest = sorted[0];
  const highest = sorted[sorted.length - 1];

  const cdfBuild = useCallback((t: Theme) => ({
    xAxis: axis(t, `${metric} (${unit})`, { type: "value", scale: true }),
    yAxis: axis(t, "fraction of samples", { type: "value", min: 0, max: 1 }),
    series: runs.map((r, i) => ({ name: r.label, type: "line", showSymbol: cdfs[i]!.approx, step: false, data: cdfs[i]!.pts, lineStyle: line(i) })),
  }), [runs, cdfs, metric, unit]);

  const histBuild = useCallback((t: Theme) => ({
    xAxis: axis(t, `${metric} (${unit})`, { type: "value", scale: true }),
    yAxis: axis(t, "share of samples per bin", { type: "value" }),
    series: runs.filter((r) => r.summary.histogram).map((r, i) => {
      const h = r.summary.histogram!;
      const total = h.counts.reduce((a, b) => a + b, 0) || 1;
      return { name: r.label, type: "line", step: "middle", showSymbol: false, lineStyle: line(i), data: h.counts.map((c, j) => [(h.edges[j]! + h.edges[j + 1]!) / 2, c / total]) };
    }),
  }), [runs, metric, unit]);

  const boxBuild = useCallback((t: Theme) => ({
    tooltip: { trigger: "item" },
    xAxis: axis(t, "run", { type: "category", data: runs.map((r) => r.label) }),
    yAxis: axis(t, `${metric} (${unit})`, { type: "value", scale: true }),
    series: [{ name: metric, type: "boxplot", itemStyle: { color: "transparent", borderColor: t.series[0], borderWidth: 2 },
      data: runs.map((r) => [r.summary.min, r.summary.p25 ?? r.summary.p50, r.summary.p50, r.summary.p75 ?? r.summary.p50, r.summary.max]) }],
  }), [runs, metric, unit]);

  const throughput = useMemo(() => extras.filter((e) => /\/s$/.test(e.unit)), [extras]);
  const memory = useMemo(() => extras.filter((e) => /^(MB|GB|MiB|GiB)$/.test(e.unit)), [extras]);
  const tputBuild = useMemo(() => overRunsBuild(throughput, "p50 per run"), [throughput]);
  const memBuild = useMemo(() => overRunsBuild(memory, "p50 per run"), [memory]);

  const gpuWithData = useMemo(() => gpu.filter((g) => g.points.length), [gpu]);
  const gpuBuild = useCallback((t: Theme) => ({
    xAxis: axis(t, "time since run start (s)", { type: "value" }),
    yAxis: [axis(t, "GPU utilisation (%)", { type: "value", min: 0, max: 100 }), axis(t, "GPU memory (MB)", { type: "value", position: "right" })],
    series: gpuWithData.flatMap((g, i) => [
      { name: `${g.label} util`, type: "line", showSymbol: false, lineStyle: line(i), data: g.points.map((p) => [p.t / 1000, p.util]) },
      { name: `${g.label} memory`, type: "line", showSymbol: false, yAxisIndex: 1, lineStyle: { ...line(i), width: 1 }, data: g.points.map((p) => [p.t / 1000, p.mem]) },
    ]),
  }), [gpuWithData]);

  return (
    <div className="space-y-4">
      <Figure id="cdf" title={`CDF of ${metric}`}
        summary={`${runs.length} runs. Lowest median: ${lowest?.label} at ${fmt(lowest?.summary.p50)} ${unit}; highest: ${highest?.label} at ${fmt(highest?.summary.p50)} ${unit}.${anyApprox ? " Some curves are approximate (drawn from stored percentiles) until the stats job finishes." : ""}`}
        table={<table className="text-sm"><caption className="sr-only">Percentile points per run</caption><thead><tr><th scope="col">Run</th><th scope="col">Value ({unit})</th><th scope="col">Fraction</th></tr></thead>
          <tbody>{runs.flatMap((r, i) => cdfs[i]!.pts.filter((_, j) => cdfs[i]!.approx || j % 20 === 0 || j === cdfs[i]!.pts.length - 1).map(([x, y], j) => <tr key={`${r.id}-${j}`}><td>{r.label}</td><td className="num">{fmt(x)}</td><td className="num">{fmt(y, 3)}</td></tr>))}</tbody></table>}>
        <Chart build={cdfBuild} label="cdf" />
      </Figure>

      <Figure id="hist" title={`Histogram of ${metric}`}
        summary={runs.some((r) => r.summary.histogram) ? "Share of samples per bin, as a frequency polygon so runs can overlap. Bins come from the stats job." : "Histograms appear once the stats job has run for these runs."}
        table={<table className="text-sm"><caption className="sr-only">Histogram bins per run</caption><thead><tr><th scope="col">Run</th><th scope="col">Bin start</th><th scope="col">Bin end</th><th scope="col">Count</th></tr></thead>
          <tbody>{runs.flatMap((r) => (r.summary.histogram?.counts ?? []).map((c, j) => <tr key={`${r.id}-${j}`}><td>{r.label}</td><td className="num">{fmt(r.summary.histogram!.edges[j])}</td><td className="num">{fmt(r.summary.histogram!.edges[j + 1])}</td><td className="num">{c}</td></tr>))}</tbody></table>}>
        <Chart build={histBuild} label="histogram" />
      </Figure>

      <Figure id="box" title={`Box plot of ${metric}`} summary="Whiskers are min and max; the box is p25 to p75; the line is the median."
        table={<table className="text-sm"><caption className="sr-only">Box plot values</caption><thead><tr><th scope="col">Run</th><th scope="col">Min</th><th scope="col">p25</th><th scope="col">p50</th><th scope="col">p75</th><th scope="col">Max</th></tr></thead>
          <tbody>{runs.map((r) => <tr key={r.id}><td>{r.label}</td><td className="num">{fmt(r.summary.min)}</td><td className="num">{fmt(r.summary.p25)}</td><td className="num">{fmt(r.summary.p50)}</td><td className="num">{fmt(r.summary.p75)}</td><td className="num">{fmt(r.summary.max)}</td></tr>)}</tbody></table>}>
        <Chart build={boxBuild} label="boxplot" />
      </Figure>

      <Figure id="tput" title="Throughput over runs"
        summary={throughput.length ? `Median throughput per run for ${[...new Set(throughput.map((e) => e.metric))].join(", ")}, in start order.` : "No throughput metric (a unit ending in /s) in these runs."}
        table={<ExtraTable items={throughput} />}>
        {throughput.length > 0 && <Chart build={tputBuild} label="throughput" />}
      </Figure>

      <Figure id="mem" title="Memory over runs" summary={memory.length ? "Median memory per run (metrics in MB or GB)." : "No memory metric (unit MB or GB) in these runs."} table={<ExtraTable items={memory} />}>
        {memory.length > 0 && <Chart build={memBuild} label="memory" />}
      </Figure>

      <Figure id="gpu" title="GPU utilisation and memory"
        summary={gpuWithData.length ? `GPU timelines for ${gpuWithData.length} run(s): peak utilisation ${fmt(Math.max(...gpuWithData.flatMap((g) => g.points.map((p) => p.util ?? 0))), 3)}%.` : "No GPU timeline: nvidia-smi was not available, or these were CPU-only runs."}
        table={<table className="text-sm"><caption className="sr-only">GPU samples (every 10th)</caption><thead><tr><th scope="col">Run</th><th scope="col">t (s)</th><th scope="col">Util (%)</th><th scope="col">Memory (MB)</th><th scope="col">Power (W)</th></tr></thead>
          <tbody>{gpuWithData.flatMap((g) => g.points.filter((_, j) => j % 10 === 0).map((p, j) => <tr key={`${g.runId}-${j}`}><td>{g.label}</td><td className="num">{fmt(p.t / 1000)}</td><td className="num">{fmt(p.util)}</td><td className="num">{fmt(p.mem)}</td><td className="num">{fmt(p.power)}</td></tr>))}</tbody></table>}>
        {gpuWithData.length > 0 && <Chart build={gpuBuild} label="gpu" />}
      </Figure>
    </div>
  );
}

function ExtraTable({ items }: { items: ExtraMetric[] }) {
  if (!items.length) return <p className="text-sm">No data.</p>;
  return (
    <table className="text-sm"><caption className="sr-only">Median per run</caption>
      <thead><tr><th scope="col">Run</th><th scope="col">Metric</th><th scope="col">p50</th><th scope="col">Unit</th></tr></thead>
      <tbody>{items.map((e) => <tr key={`${e.runId}-${e.metric}`}><td>{e.label}</td><td>{e.metric}</td><td className="num">{fmt(e.p50)}</td><td>{e.unit}</td></tr>)}</tbody>
    </table>
  );
}
