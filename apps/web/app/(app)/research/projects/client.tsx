"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type ApiErr = { error?: { message?: string; details?: { fields?: { path: string; message: string }[]; reasons?: string[] } } };

async function send(url: string, method: string, body: unknown): Promise<{ ok: boolean; data: unknown; error: string | null; fields: string[] }> {
  const r = await fetch(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = (await r.json().catch(() => ({}))) as ApiErr;
  if (r.ok) return { ok: true, data, error: null, fields: [] };
  const fields = (data.error?.details?.fields ?? []).map((f) => `${f.path || "(body)"}: ${f.message}`);
  return { ok: false, data, error: data.error?.message ?? `HTTP ${r.status}`, fields: [...fields, ...(data.error?.details?.reasons ?? [])] };
}

function Problem({ id, error, fields }: { id: string; error: string | null; fields: string[] }) {
  if (!error) return null;
  return (
    <div id={id} role="alert" className="text-sm text-[var(--danger)]">
      <p>{error}</p>
      {fields.length > 0 && <ul className="list-disc pl-6">{fields.map((f) => <li key={f}>{f}</li>)}</ul>}
    </div>
  );
}

export function CreateProject() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [hypothesis, setHypothesis] = useState("");
  const [err, setErr] = useState<{ error: string | null; fields: string[] }>({ error: null, fields: [] });
  return (
    <form className="panel space-y-3" aria-labelledby="new-title" onSubmit={async (e) => {
      e.preventDefault();
      const r = await send("/api/projects", "POST", { title, ...(hypothesis ? { hypothesis } : {}) });
      if (r.ok) router.push(`/research/projects/${(r.data as { id: number }).id}`);
      else setErr(r);
    }}>
      <h2 id="new-title" className="text-xl">New project</h2>
      <label className="block text-sm">Title<input className="input mt-1 w-full" required minLength={3} maxLength={300} value={title} onChange={(e) => setTitle(e.target.value)} aria-describedby={err.error ? "new-err" : undefined} /></label>
      <label className="block text-sm">Hypothesis (you can refine it until you pre-register)
        <textarea className="input mt-1" rows={3} maxLength={5000} value={hypothesis} onChange={(e) => setHypothesis(e.target.value)} /></label>
      <Problem id="new-err" {...err} />
      <button type="submit" className="btn btn-primary">Create project</button>
    </form>
  );
}

export function PreregForm({ projectId, hypothesis }: { projectId: number; hypothesis: string | null }) {
  const router = useRouter();
  const [h, setH] = useState(hypothesis ?? "");
  const [f, setF] = useState({ primary_metric: "latency_ms", baseline_desc: "", stopping_rule: "", min_repetitions: 5 });
  const [err, setErr] = useState<{ error: string | null; fields: string[] }>({ error: null, fields: [] });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: k === "min_repetitions" ? Number(e.target.value) : e.target.value });
  return (
    <form className="space-y-3" aria-labelledby="prereg-title" onSubmit={async (e) => {
      e.preventDefault();
      const r = await send(`/api/projects/${projectId}`, "PATCH", { hypothesis: h, prereg: f });
      if (r.ok) router.refresh(); else setErr(r);
    }}>
      <h3 id="prereg-title" className="text-lg">Pre-register (F.5)</h3>
      <p className="text-sm">Saved once, with a timestamp. After that, changes are amendments appended to the plan; the original stays visible.</p>
      <label className="block text-sm">Hypothesis<textarea className="input mt-1" rows={3} required value={h} onChange={(e) => setH(e.target.value)} /></label>
      <label className="block text-sm">Primary metric (as uploaded, e.g. latency_ms)<input className="input mt-1 w-full" required pattern="[a-z][a-z0-9_.]{0,63}" value={f.primary_metric} onChange={set("primary_metric")} /></label>
      <label className="block text-sm">Baseline<input className="input mt-1 w-full" required minLength={3} value={f.baseline_desc} onChange={set("baseline_desc")} /></label>
      <label className="block text-sm">Stopping rule<input className="input mt-1 w-full" required minLength={3} value={f.stopping_rule} onChange={set("stopping_rule")} /></label>
      <label className="block text-sm">Minimum repetitions per config<input className="input mt-1 w-24" type="number" min={2} max={100} required value={f.min_repetitions} onChange={set("min_repetitions")} /></label>
      <Problem id="prereg-err" {...err} />
      <button type="submit" className="btn btn-primary">Pre-register</button>
    </form>
  );
}

export function PlanEditor({ projectId, planMd, preregistered }: { projectId: number; planMd: string | null; preregistered: boolean }) {
  const router = useRouter();
  const [text, setText] = useState(preregistered ? "" : planMd ?? "");
  const [err, setErr] = useState<{ error: string | null; fields: string[] }>({ error: null, fields: [] });
  const [saved, setSaved] = useState(false);
  return (
    <form className="space-y-2" onSubmit={async (e) => {
      e.preventDefault();
      const r = await send(`/api/projects/${projectId}`, "PATCH", preregistered ? { amendment: text } : { planMd: text });
      if (r.ok) { setSaved(true); if (preregistered) setText(""); router.refresh(); } else setErr(r);
    }}>
      <label className="block text-sm">{preregistered ? "Add an amendment (appended with a timestamp; nothing earlier changes)" : "Experiment plan (plain text)"}
        <textarea className="input mt-1" rows={preregistered ? 3 : 8} required={preregistered} minLength={preregistered ? 3 : 0} value={text} onChange={(e) => { setText(e.target.value); setSaved(false); }} /></label>
      <Problem id="plan-err" {...err} />
      <button type="submit" className="btn">{preregistered ? "Add amendment" : "Save plan"}</button>
      {saved && <span role="status" className="ml-2 text-sm">Saved.</span>}
    </form>
  );
}

export function UploadRun({ projectId }: { projectId: number }) {
  const router = useRouter();
  const [state, setState] = useState<{ error: string | null; fields: string[]; ok?: string }>({ error: null, fields: [] });
  return (
    <form className="space-y-2" onSubmit={async (e) => {
      e.preventDefault();
      const file = (e.currentTarget.elements.namedItem("file") as HTMLInputElement).files?.[0];
      if (!file) return;
      if (file.size > 20 * 1024 * 1024) { setState({ error: "The file is larger than 20 MB.", fields: [] }); return; }
      const r = await fetch(`/api/projects/${projectId}/runs`, { method: "POST", headers: { "content-type": "application/json" }, body: await file.text() });
      const data = (await r.json().catch(() => ({}))) as ApiErr & { runId?: number; duplicate?: boolean };
      if (r.ok) { setState({ error: null, fields: [], ok: `Stored run #${data.runId}${data.duplicate ? " (this file was already uploaded)" : ""}. The server recomputed its summaries.` }); router.refresh(); }
      else setState({ error: data.error?.message ?? `HTTP ${r.status}`, fields: (data.error?.details?.fields ?? []).map((f) => `${f.path || "(body)"}: ${f.message}`) });
    }}>
      <label className="block text-sm">Benchmark JSON (schema: packages/contracts/schemas/benchmark.schema.json, at most 20 MB)
        <input name="file" type="file" accept="application/json,.json" required className="mt-1 block" /></label>
      <Problem id="upload-err" error={state.error} fields={state.fields} />
      {state.ok && <p role="status" className="text-sm">{state.ok}</p>}
      <button type="submit" className="btn">Upload run</button>
    </form>
  );
}

export function GenerateReport({ projectId, ready, reasons }: { projectId: number; ready: boolean; reasons: string[] }) {
  const router = useRouter();
  const [err, setErr] = useState<{ error: string | null; fields: string[] }>({ error: null, fields: [] });
  const [busy, setBusy] = useState(false);
  return (
    <div className="space-y-2">
      <button type="button" className="btn btn-primary" aria-disabled={!ready} aria-describedby={ready ? undefined : "report-why"}
        onClick={async () => {
          if (!ready || busy) return;
          setBusy(true);
          const r = await send(`/api/projects/${projectId}/report`, "POST", {});
          setBusy(false);
          if (r.ok) router.refresh(); else setErr(r);
        }}>
        {busy ? "Queuing…" : "Generate report"}
      </button>
      {!ready && (
        <div id="report-why" className="text-sm">
          <p>Not available yet:</p>
          <ul className="list-disc pl-6">{reasons.map((r) => <li key={r}>{r}</li>)}</ul>
        </div>
      )}
      <Problem id="report-err" {...err} />
    </div>
  );
}

export function RefreshWhilePending({ pending }: { pending: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!pending) return;
    const t = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(t);
  }, [pending, router]);
  return pending ? <p role="status" className="text-sm">Rendering… this page refreshes every few seconds.</p> : null;
}
