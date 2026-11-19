"use client";
import { useRouter } from "next/navigation";
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

/** Queues a fresh check of this resource (worker-node, SSRF-guarded) and refreshes the page while it runs. */
export function RecheckButton({ sourceId }: { sourceId: number }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "queued" | "error">("idle");
  return (
    <>
      <button type="button" className="underline" disabled={state === "queued"} onClick={async () => {
        const r = await fetch("/api/sources/verify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sourceId }) });
        if (!r.ok) return setState("error");
        setState("queued");
        for (let i = 0; i < 10; i++) { await new Promise((res) => setTimeout(res, 1500)); router.refresh(); }
        setState("idle");
      }}>Re-check now</button>
      {state === "queued" && <span role="status">Checking…</span>}
      {state === "error" && <span role="alert">Could not queue the check.</span>}
    </>
  );
}

export function ReportLink({ sourceId }: { sourceId: number }) {
  const [done, setDone] = useState(false);
  return done ? <span role="status">Reported — thanks; the link checker re-checks it first.</span> : (
    <button type="button" className="underline" onClick={async () => { const r = await fetch(`/api/sources/${sourceId}/report`, { method: "POST" }); if (r.ok) setDone(true); }}>Report a broken link</button>
  );
}
