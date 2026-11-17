"use client";
import { useState } from "react";

export function AddCards({ slug, total, inDeck }: { slug: string; total: number; inDeck: number }) {
  const [state, setState] = useState<{ added: number; have: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const have = state ? state.have + state.added : inDeck;
  return (
    <div className="mt-3 flex items-center gap-3">
      <button type="button" className="btn" disabled={have >= total} onClick={async () => {
        const r = await fetch("/api/cards", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ lesson: slug }) });
        if (!r.ok) { setErr(`Could not add cards (HTTP ${r.status}). Nothing was changed.`); return; }
        const j = await r.json();
        setState({ added: j.added, have: j.alreadyInDeck });
      }}>{have >= total ? "All cards are in your deck" : "Add must-know cards to my deck"}</button>
      <span role="status" className="text-sm">{state ? `Added ${state.added} card(s).` : `${inDeck} of ${total} in your deck.`}</span>
      {err && <span role="alert" className="text-sm text-[var(--danger)]">{err}</span>}
    </div>
  );
}

export function ReportLink({ sourceId }: { sourceId: number }) {
  const [done, setDone] = useState(false);
  return done ? <span role="status">Reported — thanks; the link checker re-checks it first.</span> : (
    <button type="button" className="underline" onClick={async () => { const r = await fetch(`/api/sources/${sourceId}/report`, { method: "POST" }); if (r.ok) setDone(true); }}>Report a broken link</button>
  );
}
