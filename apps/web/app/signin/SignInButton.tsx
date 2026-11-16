"use client";
import { useState } from "react";

export function SignInButton() {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function go() {
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch("/api/auth/sign-in/social", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ provider: "github", callbackURL: "/today", errorCallbackURL: "/signin?error=1" }) });
      const j = await r.json();
      if (!r.ok || typeof j.url !== "string") throw new Error(`HTTP ${r.status}`);
      window.location.assign(j.url);
    } catch (e) { setErr(`Could not start sign-in (${String(e)}).`); setBusy(false); }
  }
  return (
    <>
      <button type="button" className="btn btn-primary" onClick={go} disabled={busy}>{busy ? "Redirecting…" : "Sign in with GitHub"}</button>
      {err && <p role="alert" className="text-[var(--danger)]">{err}</p>}
    </>
  );
}
