"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Err = { error?: { message?: string; details?: { fields?: { path: string; message: string }[] } } };

export function AddPaper() {
  const router = useRouter();
  const [mode, setMode] = useState<"arxiv" | "url">("arxiv");
  const [arxivId, setArxivId] = useState("");
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <form className="panel space-y-3" aria-labelledby="add-title" onSubmit={async (e) => {
      e.preventDefault();
      const r = await fetch("/api/papers", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(mode === "arxiv" ? { arxivId } : { url, title }) });
      const d = (await r.json().catch(() => ({}))) as Err & { duplicate?: boolean };
      if (r.ok) { setMsg({ ok: true, text: d.duplicate ? "Already in your library." : "Added. Title, authors and abstract appear once arXiv confirms them." }); setArxivId(""); setUrl(""); setTitle(""); router.refresh(); }
      else setMsg({ ok: false, text: [d.error?.message ?? `HTTP ${r.status}`, ...(d.error?.details?.fields ?? []).map((f) => `${f.path}: ${f.message}`)].join(" ") });
    }}>
      <h2 id="add-title" className="text-xl">Add a paper</h2>
      <fieldset className="text-sm"><legend className="sr-only">Source</legend>
        <label className="mr-4"><input type="radio" name="mode" checked={mode === "arxiv"} onChange={() => setMode("arxiv")} /> arXiv id</label>
        <label><input type="radio" name="mode" checked={mode === "url"} onChange={() => setMode("url")} /> Other URL</label>
      </fieldset>
      {mode === "arxiv" ? (
        <label className="block text-sm">arXiv id (for example 2309.06180)<input className="input mt-1 w-full" required value={arxivId} onChange={(e) => setArxivId(e.target.value)} /></label>
      ) : (
        <>
          <label className="block text-sm">URL<input className="input mt-1 w-full" type="url" required value={url} onChange={(e) => setUrl(e.target.value)} /></label>
          <label className="block text-sm">Title (yours, shown as unverified until the page is checked)<input className="input mt-1 w-full" required minLength={3} value={title} onChange={(e) => setTitle(e.target.value)} /></label>
        </>
      )}
      <button type="submit" className="btn btn-primary">Add paper</button>
      {msg && <p role={msg.ok ? "status" : "alert"} className={`text-sm ${msg.ok ? "" : "text-[var(--danger)]"}`}>{msg.text}</p>}
    </form>
  );
}

export function PaperNotes({ id, notes, status }: { id: number; notes: string | null; status: string }) {
  const [text, setText] = useState(notes ?? "");
  const [st, setSt] = useState(status);
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <form className="mt-2 space-y-2" onSubmit={async (e) => {
      e.preventDefault();
      const r = await fetch(`/api/papers/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ userNotes: text, status: st }) });
      setMsg(r.ok ? "Saved." : `Could not save (HTTP ${r.status}).`);
    }}>
      <label className="block text-sm">Your notes (searchable)<textarea className="input mt-1" rows={4} value={text} onChange={(e) => { setText(e.target.value); setMsg(null); }} /></label>
      <label className="block text-sm">Status
        <select className="input ml-2" value={st} onChange={(e) => setSt(e.target.value)}>
          <option value="to_read">To read</option><option value="read">Read</option><option value="analysed">Analysed</option>
        </select>
      </label>
      <button type="submit" className="btn">Save notes</button>
      {msg && <span role="status" className="ml-2 text-sm">{msg}</span>}
    </form>
  );
}
