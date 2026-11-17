"use client";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";

async function post(url: string, body: unknown): Promise<{ ok: boolean; json: Record<string, unknown> }> {
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return { ok: r.ok, json: await r.json().catch(() => ({})) };
}
const errText = (j: Record<string, unknown>) => ((j.error as { message?: string })?.message ?? "Request failed") + " Nothing was saved.";

export function QuizForm({ gateId, quiz }: { gateId: string; quiz: { id: string; title: string; pass_pct: number; questions: { id: string; prompt: string; choices: string[] }[] } }) {
  const [answers, setAnswers] = useState<Record<string, number | null>>({});
  const [result, setResult] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();
  return (
    <form className="panel space-y-4" aria-labelledby={`quiz-${quiz.id}`} onSubmit={async (e) => {
      e.preventDefault();
      const r = await post(`/api/gates/${gateId}/attempts`, { type: "quiz", quiz: quiz.id, answers });
      if (!r.ok) { setErr(errText(r.json)); return; }
      setErr(null);
      setResult(`Score ${r.json.correct}/${r.json.total} (${r.json.pct}%): ${r.json.passed ? "passed" : `below ${quiz.pass_pct}%, failed`}.`);
      router.refresh();
    }}>
      <h2 id={`quiz-${quiz.id}`} className="text-xl">{quiz.title} <span className="text-sm text-[var(--ink-muted)]">(pass at {quiz.pass_pct}%)</span></h2>
      {quiz.questions.map((q, i) => (
        <fieldset key={q.id} className="space-y-1">
          <legend className="font-medium">{i + 1}. {q.prompt}</legend>
          {q.choices.map((c, ci) => (
            <label key={ci} className="flex min-h-6 items-center gap-2">
              <input type="radio" name={`${quiz.id}-${q.id}`} checked={answers[q.id] === ci} onChange={() => setAnswers((a) => ({ ...a, [q.id]: ci }))} /> {c}
            </label>
          ))}
        </fieldset>
      ))}
      <button className="btn btn-primary" type="submit">Submit answers</button>
      {result && <p role="status">{result}</p>}
      {err && <p role="alert" className="text-[var(--danger)]">{err}</p>}
    </form>
  );
}

export function ArtifactForm({ gateId, kinds }: { gateId: string; kinds: string[] }) {
  const [kind, setKind] = useState(kinds[0]!);
  const [url, setUrl] = useState("");
  const [sha, setSha] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const router = useRouter();
  const ids = { url: useId(), sha: useId(), kind: useId(), err: useId() };
  return (
    <form className="panel space-y-3" aria-labelledby="art-title" onSubmit={async (e) => {
      e.preventDefault();
      const r = await post(`/api/gates/${gateId}/attempts`, { type: "artifact", kind, url, ...(sha ? { commitSha: sha } : {}) });
      setMsg(r.ok ? { ok: true, text: `Saved. Gate status: ${String(r.json.status).replace("_", " ")}.` } : { ok: false, text: errText(r.json) });
      if (r.ok) router.refresh();
    }}>
      <h2 id="art-title" className="text-xl">Link an artifact</h2>
      <label className="block" htmlFor={ids.kind}>Kind</label>
      <select id={ids.kind} className="rounded border border-[var(--border)] bg-[var(--surface)] p-2" value={kind} onChange={(e) => setKind(e.target.value)}>{kinds.map((k) => <option key={k} value={k}>{k.replace("_", " ")}</option>)}</select>
      <label className="block" htmlFor={ids.url}>HTTPS link (e.g. REPORT.md at a commit)</label>
      <input id={ids.url} required type="url" pattern="https://.*" className="w-full rounded border border-[var(--border)] bg-[var(--surface)] p-2" value={url} onChange={(e) => setUrl(e.target.value)} aria-describedby={msg && !msg.ok ? ids.err : undefined} />
      <label className="block" htmlFor={ids.sha}>Commit SHA (optional, 40 hex characters)</label>
      <input id={ids.sha} className="num w-full rounded border border-[var(--border)] bg-[var(--surface)] p-2" value={sha} onChange={(e) => setSha(e.target.value.trim())} pattern="[0-9a-f]{40}" />
      <button className="btn" type="submit">Save link</button>
      {msg && <p id={ids.err} role={msg.ok ? "status" : "alert"} className={msg.ok ? "" : "text-[var(--danger)]"}>{msg.text}</p>}
    </form>
  );
}

const LEVELS = ["missing", "partial", "competent", "strong"] as const;
export function RubricForm({ attemptId, criteria, current }: { attemptId: number; criteria: string[]; current: Record<string, string | null> }) {
  const [levels, setLevels] = useState<Record<string, string>>(Object.fromEntries(criteria.map((c) => [c, current[c] ?? ""])));
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const router = useRouter();
  return (
    <form className="panel space-y-3" aria-labelledby="rubric-title" onSubmit={async (e) => {
      e.preventDefault();
      const scores = criteria.filter((c) => levels[c]).map((c) => ({ criterion: c, level: levels[c] }));
      const r = await post(`/api/attempts/${attemptId}/rubric`, { scores });
      setMsg(r.ok ? { ok: true, text: `Saved as self-assessed. Gate status: ${String(r.json.status).replace("_", " ")}.` } : { ok: false, text: errText(r.json) });
      if (r.ok) router.refresh();
    }}>
      <h2 id="rubric-title" className="text-xl">Rubric (self-assessed)</h2>
      <p className="text-sm text-[var(--ink-muted)]">Pass rule: no criterion &quot;missing&quot; and at least half &quot;competent&quot; or better. Your scores are labelled self-assessed; hiring evidence later counts only reviewer or automatic scores.</p>
      {criteria.map((c) => (
        <fieldset key={c}>
          <legend className="font-medium">{c}</legend>
          <div className="flex flex-wrap gap-3">
            {LEVELS.map((l) => (
              <label key={l} className="flex min-h-6 items-center gap-1"><input type="radio" name={`rub-${c}`} checked={levels[c] === l} onChange={() => setLevels((x) => ({ ...x, [c]: l }))} /> {l}</label>
            ))}
          </div>
        </fieldset>
      ))}
      <button className="btn" type="submit">Save rubric scores</button>
      {msg && <p role={msg.ok ? "status" : "alert"} className={msg.ok ? "" : "text-[var(--danger)]"}>{msg.text}</p>}
    </form>
  );
}
