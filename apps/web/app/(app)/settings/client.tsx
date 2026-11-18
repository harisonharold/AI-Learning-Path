"use client";
import { useCallback, useEffect, useState } from "react";
import { Badge } from "@atlas/ui";

type Job = { id: string; kind: string; status: string; error: string | null; createdAt: string; resultJson: unknown };

export function JobsPanel() {
  const [items, setItems] = useState<Job[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/jobs?limit=10", { cache: "no-store" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setItems((await r.json()).items);
      setErr(null);
    } catch (e) { setErr(String(e)); }
  }, []);
  useEffect(() => {
    const first = setTimeout(load, 0);
    const t = setInterval(load, 2000);
    return () => { clearTimeout(first); clearInterval(t); };
  }, [load]);
  async function run() {
    const r = await fetch("/api/jobs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: "diag.echo", input: { message: "ping" } }) });
    if (!r.ok) setErr(`Could not enqueue (HTTP ${r.status})`);
    void load();
  }
  return (
    <section className="panel space-y-3" aria-labelledby="jobs-title">
      <h2 id="jobs-title" className="text-xl">Jobs</h2>
      <p className="text-sm text-[var(--ink-muted)]">The diagnostic job goes web → Redis → Python worker → signed callback, to prove the pipeline works.</p>
      <button type="button" className="btn" onClick={run}>Run diagnostic job</button>
      {err && <p role="alert" className="text-[var(--danger)]">Jobs failed to load: {err}. Your data is safe; retrying every 2 s.</p>}
      {items === null && !err && <p role="status">Loading jobs…</p>}
      {items?.length === 0 && <p>No jobs yet.</p>}
      {items && items.length > 0 && (
        <table className="w-full text-sm">
          <caption className="sr-only">Recent jobs</caption>
          <thead><tr className="text-left"><th>Kind</th><th>Status</th><th>Created</th></tr></thead>
          <tbody>
            {items.map((j) => (
              <tr key={j.id} data-job-id={j.id} data-status={j.status}>
                <td className="num">{j.kind}</td>
                <td>{j.status}{j.error ? ` — ${j.error}` : ""}</td>
                <td className="num">{new Date(j.createdAt).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

type Revoke = { url: string; verification: string; steps: string[]; note: string };

export function AccountDelete() {
  const [confirm, setConfirm] = useState("");
  const [done, setDone] = useState<Revoke | null>(null);
  const [err, setErr] = useState<string | null>(null);
  async function del() {
    const r = await fetch("/api/account", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ confirm }) });
    if (!r.ok) { setErr(`Delete failed (HTTP ${r.status}). Nothing was deleted.`); return; }
    setDone((await r.json()).githubRevoke);
  }
  if (done) {
    return (
      <section className="panel space-y-3" aria-labelledby="deleted-title" data-testid="revoke-help">
        <h2 id="deleted-title" className="text-xl">Account deleted</h2>
        <p>All your Systems Atlas data has been deleted. Systems Atlas did not contact GitHub. To revoke its access on GitHub, do this yourself:</p>
        <ol className="list-decimal space-y-1 pl-6">{done.steps.map((s) => <li key={s}>{s}</li>)}</ol>
        <p><a href={done.url} rel="noopener noreferrer">{done.url}</a> {done.verification !== "verified" && <Badge kind="unverified">Unverified link</Badge>}</p>
        <p className="text-sm text-[var(--ink-muted)]">{done.note}</p>
      </section>
    );
  }
  return (
    <section className="panel space-y-3" aria-labelledby="del-title">
      <h2 id="del-title" className="text-xl">Delete account</h2>
      <p>Deletes every record: progress, projects, runs, settings, tokens. This cannot be undone. Systems Atlas will not contact GitHub; you will get steps to revoke its access there yourself.</p>
      <label className="block" htmlFor="del-confirm">Type <code>DELETE MY ACCOUNT</code> to confirm</label>
      <input id="del-confirm" aria-describedby={err ? "del-err" : undefined} className="w-full rounded border border-[var(--border)] bg-[var(--surface)] px-3 py-2" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      {err && <p id="del-err" role="alert" className="text-[var(--danger)]">{err}</p>}
      <button type="button" className="btn btn-danger" disabled={confirm !== "DELETE MY ACCOUNT"} onClick={del}>Delete my account</button>
    </section>
  );
}

export function PlanForm(p: { mode: "RI" | "ACC"; hoursPerWeek: number; timezone: string }) {
  const [mode, setMode] = useState(p.mode);
  const [hours, setHours] = useState(p.hoursPerWeek);
  const [tz, setTz] = useState(p.timezone);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <form className="panel space-y-3" aria-labelledby="plan-title" onSubmit={async (e) => {
      e.preventDefault();
      const r = await fetch("/api/settings", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ mode, hoursPerWeek: hours, timezone: tz }) });
      setMsg(r.ok ? { ok: true, text: "Saved." } : { ok: false, text: "Not saved: check the values." });
    }}>
      <h2 id="plan-title" className="text-xl">Plan</h2>
      <fieldset><legend>Mode</legend>
        <label className="mr-4"><input type="radio" name="mode" checked={mode === "RI"} onChange={() => setMode("RI")} /> Research-Intensive (24 weeks at 40 h)</label>
        <label><input type="radio" name="mode" checked={mode === "ACC"} onChange={() => setMode("ACC")} /> Accelerated (16 weeks at 50 h)</label>
      </fieldset>
      <label htmlFor="hours" className="block">Hours per week</label>
      <select id="hours" className="rounded border border-[var(--border)] bg-[var(--surface)] p-2" value={hours} onChange={(e) => setHours(Number(e.target.value))}>{[20, 30, 40, 50].map((h) => <option key={h} value={h}>{h}</option>)}</select>
      <label htmlFor="tz" className="block">Time zone</label>
      <input id="tz" className="rounded border border-[var(--border)] bg-[var(--surface)] p-2" value={tz} onChange={(e) => setTz(e.target.value)} />
      <p className="text-sm text-[var(--ink-muted)]">Hours change the calendar only; gates stay the same.</p>
      <button className="btn" type="submit">Save plan</button>
      {msg && <p role={msg.ok ? "status" : "alert"} className={msg.ok ? "" : "text-[var(--danger)]"}>{msg.text}</p>}
    </form>
  );
}

type Tok = { id: number; tokenPrefix: string; scopes: string[]; expiresAt: string; revoked: boolean; lastUsedAt: string | null; createdAt: string };

/** atlas-lab runner tokens (AT-18): the plaintext is shown once, right after creation, and never again. */
export function RunnerTokens() {
  const [items, setItems] = useState<Tok[] | null>(null);
  const [fresh, setFresh] = useState<string | null>(null);
  const [days, setDays] = useState(30);
  const [scopes, setScopes] = useState({ write: true, read: true });
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(async () => {
    const r = await fetch("/api/runner/tokens", { cache: "no-store" });
    if (r.ok) setItems((await r.json()).tokens); else setErr(`Tokens failed to load (HTTP ${r.status}).`);
  }, []);
  useEffect(() => { const t = setTimeout(load, 0); return () => clearTimeout(t); }, [load]);
  async function create(e: React.FormEvent) {
    e.preventDefault();
    const s = [...(scopes.write ? ["results:write"] : []), ...(scopes.read ? ["tests:read"] : [])];
    if (!s.length) { setErr("Pick at least one scope."); return; }
    const r = await fetch("/api/runner/tokens", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scopes: s, days }) });
    if (!r.ok) { setErr(`Could not create the token (HTTP ${r.status}).`); return; }
    setFresh((await r.json()).token);
    setErr(null);
    void load();
  }
  async function revoke(id: number) {
    const r = await fetch(`/api/runner/tokens/${id}`, { method: "DELETE" });
    if (!r.ok) setErr(`Could not revoke (HTTP ${r.status}).`);
    void load();
  }
  return (
    <section className="panel space-y-3" aria-labelledby="tok-title">
      <h2 id="tok-title" className="text-xl">atlas-lab runner tokens</h2>
      <p className="text-sm text-[var(--ink-muted)]">atlas-lab uses a token to upload results (results:write) and fetch hidden gate tests (tests:read). Only a SHA-256 hash is stored; tokens expire within 90 days and can be revoked here.</p>
      <form className="flex flex-wrap items-end gap-3" onSubmit={create}>
        <fieldset className="text-sm"><legend>Scopes</legend>
          <label className="mr-3"><input type="checkbox" checked={scopes.write} onChange={(e) => setScopes({ ...scopes, write: e.target.checked })} /> results:write</label>
          <label><input type="checkbox" checked={scopes.read} onChange={(e) => setScopes({ ...scopes, read: e.target.checked })} /> tests:read</label>
        </fieldset>
        <label className="text-sm">Expires in (days)<input type="number" min={1} max={90} className="input ml-2 w-20" value={days} onChange={(e) => setDays(Number(e.target.value))} /></label>
        <button type="submit" className="btn btn-primary">Create token</button>
      </form>
      {fresh && (
        <div role="status" className="space-y-1 rounded border border-[var(--accent)] p-3 text-sm" data-new-token>
          <p><strong>Copy this token now; it will not be shown again.</strong> Then run <code>atlas-lab login --token</code> and paste it at the hidden prompt.</p>
          <code className="block break-all">{fresh}</code>
          <button type="button" className="btn" onClick={() => void navigator.clipboard?.writeText(fresh)}>Copy</button>
          <button type="button" className="btn ml-2" onClick={() => setFresh(null)}>I saved it</button>
        </div>
      )}
      {err && <p role="alert" className="text-[var(--danger)]">{err}</p>}
      {items?.length === 0 && <p className="text-sm">No tokens yet.</p>}
      {items && items.length > 0 && (
        <table className="w-full text-sm">
          <caption className="sr-only">Runner tokens</caption>
          <thead><tr className="text-left"><th scope="col">Token</th><th scope="col">Scopes</th><th scope="col">Expires</th><th scope="col">Last used</th><th scope="col">State</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>{items.map((t) => {
            const expired = new Date(t.expiresAt) <= new Date();
            return (
              <tr key={t.id} className="border-t border-[var(--border)]" data-token-id={t.id}>
                <td className="num">{t.tokenPrefix}…</td><td>{t.scopes.join(", ")}</td><td className="num">{new Date(t.expiresAt).toLocaleDateString()}</td>
                <td className="num">{t.lastUsedAt ? new Date(t.lastUsedAt).toLocaleString() : "never"}</td>
                <td>{t.revoked ? "revoked" : expired ? "expired" : "active"}</td>
                <td>{!t.revoked && !expired && <button type="button" className="btn btn-danger" onClick={() => void revoke(t.id)} aria-label={`Revoke token ${t.tokenPrefix}`}>Revoke</button>}</td>
              </tr>
            );
          })}</tbody>
        </table>
      )}
    </section>
  );
}

/** FR-30 / Q17: sample lab data, off by default. Turning it off deletes the sample project. */
export function SampleDataToggle({ on }: { on: boolean }) {
  const [value, setValue] = useState(on);
  const [state, setState] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function toggle(next: boolean) {
    setValue(next); // reflect the choice now; revert if the server refuses
    setBusy(true);
    setState("Saving…");
    const r = await fetch("/api/settings", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ sampleData: next }) });
    setBusy(false);
    if (r.ok) setState(next ? "Sample project created. It is labelled SAMPLE DATA everywhere." : "Sample data removed.");
    else { setValue(!next); setState(`Could not save (HTTP ${r.status}).`); }
  }
  return (
    <section className="panel space-y-2" aria-labelledby="sample-title">
      <h2 id="sample-title" className="text-xl">Sample data</h2>
      <p className="text-sm text-[var(--ink-muted)]">Adds one demo lab project with seeded runs so you can explore analytics before measuring anything. Sample records are labelled SAMPLE DATA and never count in meters, the portfolio or reports.</p>
      <label className="text-sm"><input type="checkbox" checked={value} disabled={busy} onChange={(e) => void toggle(e.target.checked)} /> Show sample lab data</label>
      {state && <p role="status" className="text-sm">{state}</p>}
    </section>
  );
}
