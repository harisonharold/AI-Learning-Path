"use client";
import { useState } from "react";
import { CodeEditor } from "@/components/CodeEditor";
import { SandboxFrame } from "@/components/sandbox/SandboxFrame";
import { useSandbox, type SandboxResult } from "@/components/sandbox/useSandbox";

type Props = { id: string; starter: string; tests: string; sandboxOrigin: string; hintsUsed: number; hints: string[]; gatePassed: boolean };
const HINT_NAMES = ["Concept", "Location", "Pseudo-code"];

export function ExerciseWorkbench(p: Props) {
  const sb = useSandbox(p.sandboxOrigin);
  const [code, setCode] = useState(p.starter);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SandboxResult | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [hints, setHints] = useState(p.hints);
  const [solution, setSolution] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setSaved(null);
    const r = await sb.run(code, p.tests);
    setResult(r);
    setBusy(false);
    const passed = r.ok && r.tests.length > 0 && r.tests.every((t) => t.passed);
    // Only the outcome is sent; the server never receives or runs your code (AT-08).
    const res = await fetch(`/api/exercises/${p.id}/practice`, { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ passed, tests: r.tests.map((t) => ({ name: t.name, passed: t.passed, ...(t.message ? { message: t.message.slice(0, 2000) } : {}) })) }) });
    setSaved(res.ok ? "Recorded as a practice check (does not count toward the gate)." : "Could not record this practice check; your code is unaffected.");
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn btn-primary" onClick={run} disabled={!sb.ready || busy}>{busy ? "Running…" : sb.ready ? "Run practice checks" : "Loading Python sandbox…"}</button>
        <button type="button" className="btn" disabled={hints.length >= 3} onClick={async () => {
          const r = await fetch(`/api/exercises/${p.id}/hints`, { method: "POST" });
          if (r.ok) setHints((await r.json()).hints);
        }}>{hints.length >= 3 ? "All hints shown" : `Show hint level ${hints.length + 1} (${HINT_NAMES[hints.length]})`}</button>
        <span className="text-sm text-[var(--ink-muted)]" role="status">Hints used: {hints.length} of 3 (recorded honestly on your attempt)</span>
      </div>
      {hints.length > 0 && <ol className="panel list-decimal space-y-1 pl-8 text-sm">{hints.map((h, i) => <li key={i}><strong>{HINT_NAMES[i]}:</strong> {h}</li>)}</ol>}
      <CodeEditor initial={p.starter} onChange={setCode} label="Your solution (Python)" />
      {result && (
        <section className="panel" aria-labelledby="res-title" aria-live="polite">
          <h2 id="res-title" className="text-lg">Practice check results</h2>
          {result.timedOut && <p className="text-[var(--danger)]">Stopped: time limit reached.</p>}
          <ul className="mt-2 space-y-1" data-testid="practice-results">
            {result.tests.map((t) => <li key={t.name} data-passed={t.passed}><span aria-hidden="true">{t.passed ? "✓" : "✕"}</span> {t.name} — {t.passed ? "passed" : "failed"}{t.message ? `: ${t.message}` : ""}</li>)}
            {result.tests.length === 0 && <li>No tests ran.</li>}
          </ul>
          {(result.stdout || result.stderr) && <pre className="num mt-2 max-h-48 overflow-auto text-sm whitespace-pre-wrap">{result.stdout}{result.stderr}</pre>}
          {saved && <p className="mt-2 text-sm">{saved}</p>}
        </section>
      )}
      <details className="panel text-sm"><summary>Public practice tests (visible on purpose)</summary><pre className="num mt-2 overflow-x-auto">{p.tests}</pre></details>
      {p.gatePassed ? (
        <div>
          <button type="button" className="btn" onClick={async () => { const r = await fetch(`/api/exercises/${p.id}/solution`); if (r.ok) setSolution((await r.json()).solution); }}>Show reference solution</button>
          {solution && <pre className="num panel mt-2 overflow-x-auto text-sm">{solution}</pre>}
        </div>
      ) : <p className="text-sm text-[var(--ink-muted)]">The reference solution unlocks after you pass this gate.</p>}
      <SandboxFrame frameRef={sb.frameRef} src={sb.src} />
    </div>
  );
}
