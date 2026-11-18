import Link from "next/link";
import { Badge, MockBanner } from "@atlas/ui";
import { pageUser } from "@/modules/auth/service";
import { settings } from "@/modules/learning/service";
import { analytics, compareRuns, listProjects, ResearchError } from "@/modules/research/service";
import { BenchmarkCharts, type ExtraMetric, type GpuSeries, type RunSeries } from "./charts";

export const metadata = { title: "Benchmark analytics" };
export const dynamic = "force-dynamic";

type Search = Promise<{ project?: string; runs?: string | string[]; metric?: string }>;
const fmt = (x: unknown, d = 4) => (typeof x === "number" && Number.isFinite(x) ? Number(x.toPrecision(d)).toString() : "n/a");
const ci = (c: unknown) => (Array.isArray(c) && c.length === 2 ? `[${fmt(c[0])}, ${fmt(c[1])}]` : "n/a");

export default async function Page({ searchParams }: { searchParams: Search }) {
  const u = await pageUser();
  const sp = await searchParams;
  const projects = await listProjects(u.id, (await settings(u.id)).sampleData);
  const pid = Number(sp.project ?? projects[0]?.id ?? 0);
  if (!projects.length) {
    return (
      <div className="prose-width space-y-4">
        <h1 className="text-3xl">Benchmark analytics</h1>
        <p className="panel">No projects yet. <Link href="/research/projects">Create a research project</Link>, pre-register it, then upload runs with atlas-lab or a JSON file. To look around first, turn on sample data in <Link href="/settings">Settings</Link>.</p>
      </div>
    );
  }
  let data: Awaited<ReturnType<typeof analytics>>;
  try {
    data = await analytics(u.id, pid);
  } catch (e) {
    if (e instanceof ResearchError) return <p className="panel" role="alert">That project was not found. <Link href="/analytics/benchmarks">Back to benchmark analytics</Link></p>;
    throw e;
  }
  const metrics = [...new Set(data.runs.flatMap((r) => r.metrics.map((m) => m.metric)))];
  const metric = sp.metric && metrics.includes(sp.metric) ? sp.metric : (data.prereg?.primary_metric && metrics.includes(data.prereg.primary_metric) ? data.prereg.primary_metric : metrics[0]);
  const withMetric = data.runs.filter((r) => r.metrics.some((m) => m.metric === metric));
  const requested = (Array.isArray(sp.runs) ? sp.runs : sp.runs ? [sp.runs] : []).map(Number).filter((n) => withMetric.some((r) => r.id === n));
  // Default: the baseline runs first, then others, ok and non-warm-up, at most 6.
  const defaults = [...withMetric].filter((r) => r.status === "ok" && !r.isWarmup).sort((a, b) => Number(b.isBaseline) - Number(a.isBaseline)).slice(0, 6).map((r) => r.id);
  const selected = (requested.length ? requested : defaults).slice(0, 6);
  const label = (r: (typeof data.runs)[number]) => `#${r.id} ${r.configName}${r.isBaseline ? " (baseline)" : ""}`;
  const chosen = selected.map((id) => data.runs.find((r) => r.id === id)!).filter(Boolean);

  let comparison: Awaited<ReturnType<typeof compareRuns>> | null = null;
  if (metric && chosen.length >= 2) comparison = await compareRuns(u.id, chosen.map((r) => r.id), metric);

  const series: RunSeries[] = chosen.map((r) => {
    const m = r.metrics.find((x) => x.metric === metric)!;
    return { id: r.id, label: label(r), isMock: r.isMock, startedAt: r.startedAt ? new Date(r.startedAt).toISOString() : null, summary: m.summary as RunSeries["summary"], unit: m.unit };
  });
  const byStart = [...chosen].sort((a, b) => (a.startedAt ? +new Date(a.startedAt) : 0) - (b.startedAt ? +new Date(b.startedAt) : 0));
  const extras: ExtraMetric[] = byStart.flatMap((r) => r.metrics.filter((m) => m.metric !== metric).map((m) => ({ runId: r.id, label: label(r), metric: m.metric, unit: m.unit, p50: Number((m.summary as { p50: number }).p50), startedAt: r.startedAt ? new Date(r.startedAt).toISOString() : null })));
  const gpu: GpuSeries[] = chosen.map((r) => ({ runId: r.id, label: label(r), points: (data.gpu[r.id] ?? []).map((p) => ({ t: p.t, util: p.util, mem: p.mem })) }));
  const anyMock = data.isMock || chosen.some((r) => r.isMock);

  return (
    <div className="space-y-6">
      {anyMock && <MockBanner />}
      <h1 className="text-3xl">Benchmark analytics</h1>
      <form method="get" className="panel space-y-3" aria-labelledby="pick-title">
        <h2 id="pick-title" className="text-xl">Pick runs</h2>
        <div className="flex flex-wrap gap-4">
          <label className="flex flex-col text-sm">Project
            <select name="project" defaultValue={String(pid)} className="input">{projects.map((p) => <option key={p.id} value={p.id}>{p.title}{p.isMock ? " (sample data)" : ""}</option>)}</select>
          </label>
          <label className="flex flex-col text-sm">Metric
            <select name="metric" defaultValue={metric} className="input">{metrics.map((m) => <option key={m} value={m}>{m}</option>)}</select>
          </label>
        </div>
        <fieldset>
          <legend className="text-sm">Runs to compare (2 to 6; the first is the reference)</legend>
          <ul className="mt-1 grid gap-1 sm:grid-cols-2">{withMetric.map((r) => (
            <li key={r.id}><label className="text-sm"><input type="checkbox" name="runs" value={r.id} defaultChecked={selected.includes(r.id)} /> {label(r)} · {r.status}{r.isWarmup ? " · warm-up" : ""}</label></li>
          ))}</ul>
        </fieldset>
        <button type="submit" className="btn btn-primary">Show</button>
      </form>

      {!metric && <p className="panel">This project has no runs with metrics yet. Upload runs from the <Link href={`/research/projects/${pid}`}>project page</Link>.</p>}
      {comparison?.degraded && (
        <p role="status" className="panel border-[var(--stale)]" data-degraded>
          <strong>Statistics service unavailable.</strong> Showing the summaries stored with each run. Bootstrap confidence intervals for differences will appear when the service is back.
        </p>
      )}

      {metric && chosen.length > 0 && (
        <section className="panel" aria-labelledby="pct-title">
          <h2 id="pct-title" className="text-xl">p50 / p95 / p99 with 95% bootstrap CIs</h2>
          <p className="text-sm">CIs come from the stats job (percentile bootstrap); &quot;pending&quot; means it has not finished yet.</p>
          <div className="overflow-x-auto"><table className="mt-2 w-full text-sm">
            <caption className="sr-only">Percentiles with confidence intervals per run</caption>
            <thead><tr className="text-left"><th scope="col">Run</th><th scope="col">n</th><th scope="col">p50</th><th scope="col">p50 CI</th><th scope="col">p95</th><th scope="col">p95 CI</th><th scope="col">p99</th><th scope="col">p99 CI</th><th scope="col">Unit</th></tr></thead>
            <tbody>{series.map((r) => (
              <tr key={r.id} className="border-t border-[var(--border)]">
                <td>{r.label} {r.isMock && <Badge kind="mock" />}</td><td className="num">{r.summary.n}</td>
                <td className="num">{fmt(r.summary.p50)}</td><td className="num">{r.summary.ci95 ? ci(r.summary.ci95.p50) : (r.summary.ci_status ?? "pending")}</td>
                <td className="num">{fmt(r.summary.p95)}</td><td className="num">{r.summary.ci95 ? ci(r.summary.ci95.p95) : "pending"}</td>
                <td className="num">{fmt(r.summary.p99)}</td><td className="num">{r.summary.ci95 ? ci(r.summary.ci95.p99) : "pending"}</td><td>{r.unit}</td>
              </tr>
            ))}</tbody>
          </table></div>
        </section>
      )}

      {comparison && !comparison.degraded && (
        <section className="panel" aria-labelledby="diff-title">
          <h2 id="diff-title" className="text-xl">Differences against #{comparison.baseRunId}</h2>
          <div className="overflow-x-auto"><table className="mt-2 w-full text-sm">
            <caption className="sr-only">Bootstrap difference of p50 against the reference run</caption>
            <thead><tr className="text-left"><th scope="col">Run</th><th scope="col">p50 difference</th><th scope="col">95% CI</th><th scope="col">Relative</th><th scope="col">Relative 95% CI</th><th scope="col">Mann-Whitney p</th><th scope="col">Same environment</th></tr></thead>
            <tbody>{comparison.comparisons.map((c) => {
              const d = c.stats?.diff.p50;
              return (
                <tr key={c.runId} className="border-t border-[var(--border)]">
                  <td>#{c.runId}</td><td className="num">{fmt(d?.diff)}</td><td className="num">{ci(d?.ci95)}</td>
                  <td className="num">{d?.rel_pct !== undefined ? `${fmt(d.rel_pct, 3)}%` : "n/a"}</td><td className="num">{d?.rel_ci95 ? `${ci(d.rel_ci95)}%` : "n/a"}</td>
                  <td className="num">{fmt(c.stats?.mann_whitney.p_value as number, 3)}</td><td>{c.sameEnv ? "yes" : "no: not comparable"}</td>
                </tr>
              );
            })}</tbody>
          </table></div>
        </section>
      )}

      {metric && series.length > 0 && <BenchmarkCharts metric={metric} runs={series} extras={extras} gpu={gpu} />}

      {comparison && (
        <section className="panel space-y-3" aria-labelledby="cdiff-title">
          <h2 id="cdiff-title" className="text-xl">Config and environment differences</h2>
          {comparison.comparisons.map((c) => (
            <div key={c.runId} className="space-y-1">
              <h3 className="text-lg">#{comparison!.baseRunId} vs #{c.runId}</h3>
              {c.warnings.length > 0 && <ul className="list-disc pl-6 text-sm" aria-label="Confounder warnings">{c.warnings.map((w) => <li key={w}><strong>Confounder warning:</strong> {w}</li>)}</ul>}
              <table className="w-full text-sm"><caption className="sr-only">Differences between the two runs</caption>
                <thead><tr className="text-left"><th scope="col">Kind</th><th scope="col">Field</th><th scope="col">#{comparison!.baseRunId}</th><th scope="col">#{c.runId}</th></tr></thead>
                <tbody>
                  {[...c.configDiff.map((d) => ({ ...d, kind: "config" })), ...c.envDiff.map((d) => ({ ...d, kind: "environment" }))].map((d) => (
                    <tr key={`${d.kind}-${d.field}`} className="border-t border-[var(--border)]"><td>{d.kind}</td><td className="num">{d.field}</td><td className="num">{JSON.stringify(d.baseline)}</td><td className="num">{JSON.stringify(d.candidate)}</td></tr>
                  ))}
                  {c.configDiff.length + c.envDiff.length === 0 && <tr><td colSpan={4}>No differences in config or environment.</td></tr>}
                </tbody>
              </table>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
