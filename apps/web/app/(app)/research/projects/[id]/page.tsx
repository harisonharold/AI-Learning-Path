import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, MockBanner } from "@atlas/ui";
import { Tabs } from "@/components/Tabs";
import { pageUser } from "@/modules/auth/service";
import { project, ResearchError } from "@/modules/research/service";
import { GenerateReport, PlanEditor, PreregForm, RefreshWhilePending, UploadRun } from "../client";

export const metadata = { title: "Research project" };
export const dynamic = "force-dynamic";

const fmt = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? Number(x.toPrecision(4)).toString() : "n/a");

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const u = await pageUser();
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id < 1) notFound();
  let p: Awaited<ReturnType<typeof project>>;
  try {
    p = await project(u.id, id);
  } catch (e) {
    if (e instanceof ResearchError) notFound();
    throw e;
  }
  const primary = p.prereg?.primary_metric;
  // Baseline pinned at the top (E.3 page 9), then newest first.
  const runs = [...p.runs].sort((a, b) => Number(b.isBaseline) - Number(a.isBaseline) || b.id - a.id);
  const failed = p.runs.filter((r) => r.status !== "ok");
  const pendingReport = p.reports.some((r) => r.status === "queued");
  const runCmd = `atlas-lab run my-experiment --project ${p.id} --config config.json --repeat ${p.prereg?.min_repetitions ?? 5} --warmup 1 -- python bench.py`;

  const tabs = [
    { id: "hypothesis", title: "Hypothesis", content: (
      <div className="space-y-3">
        <p><strong>Hypothesis:</strong> {p.hypothesis || "not written yet"}</p>
        {p.prereg ? (
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt>Primary metric</dt><dd className="num">{p.prereg.primary_metric}</dd>
            <dt>Baseline</dt><dd>{p.prereg.baseline_desc}</dd>
            <dt>Stopping rule</dt><dd>{p.prereg.stopping_rule}</dd>
            <dt>Minimum repetitions</dt><dd className="num">{p.prereg.min_repetitions}</dd>
            <dt>Pre-registered</dt><dd className="num">{p.preregisteredAt ? new Date(p.preregisteredAt).toISOString() : ""} (fixed; changes go in amendments)</dd>
          </dl>
        ) : (p.isMock ? null : <PreregForm projectId={p.id} hypothesis={p.hypothesis} />)}
      </div>) },
    { id: "plan", title: "Plan", content: (
      <div className="space-y-3">
        <pre className="whitespace-pre-wrap rounded bg-[var(--surface-2)] p-3 text-sm" tabIndex={0}>{p.planMd || "No plan written yet."}</pre>
        {!p.isMock && <PlanEditor projectId={p.id} planMd={p.planMd} preregistered={!!p.prereg} />}
      </div>) },
    { id: "configs", title: "Configs", content: p.configs.length === 0 ? <p>No configs yet: they appear with the first uploaded run.</p> : (
      <ul className="space-y-3">{p.configs.map((c) => (
        <li key={c.id}><strong>{c.name}</strong> <span className="num text-sm text-[var(--ink-muted)]">#{c.id}</span>
          <pre className="mt-1 overflow-x-auto rounded bg-[var(--surface-2)] p-2 text-sm" tabIndex={0}>{JSON.stringify(c.config, null, 2)}</pre></li>
      ))}</ul>) },
    { id: "runs", title: `Runs (${p.runs.length})`, content: (
      <div className="space-y-4">
        {p.runs.length === 0 ? <p>No runs yet.</p> : (
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <caption className="sr-only">Runs, baseline first</caption>
            <thead><tr className="text-left"><th scope="col">Run</th><th scope="col">Config</th><th scope="col">Status</th><th scope="col">Role</th><th scope="col">Environment</th><th scope="col">{primary ?? "Primary metric"} p50</th><th scope="col">CIs</th><th scope="col">Source</th><th scope="col">Raw data</th></tr></thead>
            <tbody>{runs.map((r) => {
              const m = r.metrics.find((x) => x.metric === primary) ?? r.metrics[0];
              return (
                <tr key={r.id} className="border-t border-[var(--border)]" data-run={r.id}>
                  <td className="num">#{r.id}</td><td>{r.configName}</td>
                  <td>{r.status}{r.failureNote ? `: ${r.failureNote}` : ""}</td>
                  <td>{[r.isBaseline && "baseline", r.isWarmup && "warm-up"].filter(Boolean).join(", ") || "candidate"} {r.isMock && <Badge kind="mock" />}</td>
                  <td className="num" title={r.envFingerprint}>{r.envFingerprint.slice(0, 12)}</td>
                  <td className="num">{m ? `${fmt(m.summary.p50)} ${m.unit}` : "n/a"}</td>
                  <td>{m ? String(m.summary.ci_status ?? "pending") : "n/a"}</td>
                  <td>{r.source}</td>
                  <td><a href={`/api/runs/${r.id}?download=1`} className="inline-flex min-h-6 min-w-6 items-center px-1 py-0.5" aria-label={`Download raw data for run ${r.id} (JSON)`}>JSON</a></td>
                </tr>
              );
            })}</tbody>
          </table></div>
        )}
        {!p.isMock && (
          <section aria-labelledby="add-title" className="space-y-2">
            <h3 id="add-title" className="text-lg">Add runs</h3>
            {!p.prereg && <p className="text-sm">Pre-register first: uploads are refused until then (F.5).</p>}
            <p className="text-sm">With atlas-lab (records the environment and uploads one run per repetition; failed runs are kept):</p>
            <pre className="overflow-x-auto rounded bg-[var(--surface-2)] p-2 text-sm" tabIndex={0}>{runCmd}</pre>
            <UploadRun projectId={p.id} />
          </section>
        )}
      </div>) },
    { id: "compare", title: "Compare", content: (
      <p>Open the runs in <Link href={`/analytics/benchmarks?project=${p.id}`}>benchmark analytics</Link> for CDFs, histograms, box plots, percentiles with bootstrap CIs, GPU timelines and config/environment diffs.</p>) },
    { id: "failures", title: `Failures (${failed.length})`, content: failed.length === 0 ? <p>No failed runs.</p> : (
      <ul className="list-disc pl-6">{failed.map((r) => <li key={r.id}>#{r.id} {r.configName}: {r.failureNote ?? r.status}</li>)}</ul>) },
    { id: "repro", title: "Reproducibility", content: (
      <div className="space-y-3 text-sm">
        <p>Environments seen: {new Set(p.runs.map((r) => r.envFingerprint)).size}. A speed-up is only claimed between runs with the same environment fingerprint.</p>
        <p>Commands recorded:</p>
        <ul className="list-disc pl-6">{[...new Set(p.runs.map((r) => r.command).filter(Boolean))].map((c) => <li key={c} className="num">{c}</li>)}</ul>
        <p>Confounder checklist (F.5): check each before trusting a difference.</p>
        <ul className="list-disc pl-6">{p.checklist.map((c) => <li key={c}>{c}</li>)}</ul>
      </div>) },
    { id: "report", title: "Report", content: (
      <div className="space-y-3">
        <p className="text-sm">Markdown and HTML only. The report includes failed runs, config and environment diffs, and states a percentage change only against the pre-registered baseline in the same environment.</p>
        <GenerateReport projectId={p.id} ready={p.readiness.ready} reasons={p.readiness.reasons} />
        <RefreshWhilePending pending={pendingReport} />
        {p.reports.length > 0 && (
          <ul className="space-y-1 text-sm">{p.reports.map((r) => (
            <li key={r.id} data-report={r.id} data-status={r.status}>Report #{r.id} · {new Date(r.createdAt).toISOString()} · {r.status}
              {r.status === "done" && <> · <a href={`/api/reports/${r.id}?format=md`}>Markdown</a> · <a href={`/api/reports/${r.id}?format=html`}>HTML</a></>}
              {r.status === "failed" && <> · {r.error}</>}</li>
          ))}</ul>
        )}
      </div>) },
  ];

  return (
    <div className="space-y-4">
      {p.isMock && <MockBanner />}
      <p className="text-sm"><Link href="/research/projects">All projects</Link></p>
      <h1 className="text-3xl">{p.title}</h1>
      <p className="text-sm text-[var(--ink-muted)]">Status: {p.status}. {p.prereg ? "Pre-registered." : "Not pre-registered yet."}</p>
      <section className="panel"><Tabs label="Project sections" tabs={tabs} /></section>
    </div>
  );
}
