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
