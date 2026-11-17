"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/** Wall clock for pause bookkeeping; only called from event handlers. */
const clockMs = () => Date.now();

type Item = { id: string; kind: "mcq" | "short_answer" | "code"; skill: string; prompt: string; choices?: string[]; exercise?: string };
type Answer = { kind: "mcq"; choice: number | null } | { kind: "short_answer"; text: string; selfLevel: "missing" | "partial" | "competent" | "strong" | null } | { kind: "code"; practicePassed: boolean | null } | { kind: "idk" };
type Resume = { answers: Record<string, Answer>; index: number; pausedMs: number; hoursPerWeek: number | null } | null;

export function DiagnosticRunner({ items, resume }: { items: Item[]; resume: Resume }) {
  const router = useRouter();
  const [hours, setHours] = useState<number | null>(resume?.hoursPerWeek ?? null);
  const [index, setIndex] = useState(resume?.index ?? 0);
  const [answers, setAnswers] = useState<Record<string, Answer>>(resume?.answers ?? {});
  const [paused, setPaused] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [saveState, setSaveState] = useState<string>("");
  const pausedMs = useRef(resume?.pausedMs ?? 0);
  const pauseStart = useRef<number | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  // Saves run one after another so an older snapshot can never overwrite a newer one.
  const saveChain = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    if (paused || hours === null) return;
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, [paused, hours]);
  useEffect(() => { heading.current?.focus(); }, [index]);

  function save(next: Record<string, Answer>, nextIndex: number, complete: boolean) {
    setSaveState("Saving…");
    saveChain.current = saveChain.current.then(() => send(next, nextIndex, complete)).catch(() => {
      setSaveState("Not saved: check your connection; your answers are still on this page.");
    });
    return saveChain.current;
  }
  async function send(next: Record<string, Answer>, nextIndex: number, complete: boolean) {
    const r = await fetch("/api/diagnostic/attempts", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ answers: next, index: nextIndex, pausedMs: pausedMs.current, complete, ...(hours ? { hoursPerWeek: hours } : {}) }) });
    setSaveState(r.ok ? "Saved" : "Not saved: check your connection; your answers are still on this page.");
    if (r.ok && complete) router.push("/diagnostic/result");
  }
  function togglePause() {
    const now = clockMs();
    if (paused) { pausedMs.current += now - (pauseStart.current ?? now); pauseStart.current = null; setPaused(false); }
    else { pauseStart.current = now; setPaused(true); void save(answers, index, false); }
  }
  function answer(a: Answer) {
    const item = items[index]!;
    const next = { ...answers, [item.id]: a };
    setAnswers(next);
    const ni = Math.min(index + 1, items.length);
    setIndex(ni);
    void save(next, ni, false);
  }

  if (hours === null) {
    return (
      <fieldset className="panel space-y-2">
        <legend className="text-lg font-medium">How many hours per week can you study?</legend>
        <p className="text-sm text-[var(--ink-muted)]">This sets the calendar, never the gates. Planning estimates: 960 h for Research-Intensive, 800 h for Accelerated.</p>
        <div className="flex flex-wrap gap-2">{[20, 30, 40, 50].map((h) => <button key={h} type="button" className="btn" onClick={() => setHours(h)}>{h} h/week</button>)}</div>
      </fieldset>
    );
  }
  if (index >= items.length) {
    return (
      <section className="panel space-y-3">
        <h2 className="text-xl" tabIndex={-1} ref={heading}>All {items.length} tasks answered</h2>
        <button type="button" className="btn btn-primary" onClick={() => save(answers, index, true)}>See my results</button>
        <button type="button" className="btn" onClick={() => setIndex(items.length - 1)}>Back to last task</button>
        <p role="status" className="text-sm">{saveState}</p>
      </section>
    );
  }
  const item = items[index]!;
  const prev = answers[item.id];
  return (
    <section className="panel space-y-4" aria-labelledby="task-h">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="num">Task {index + 1} of {items.length}</span>
        <span className="num" aria-label="Elapsed time">{Math.floor(elapsed / 60)} min {elapsed % 60} s{paused ? " (paused)" : ""}</span>
        <button type="button" className="btn" onClick={togglePause}>{paused ? "Resume" : "Pause"}</button>
      </div>
      {paused ? <p>Paused. {saveState === "Saved" ? "Your answers are saved; come back any time." : saveState}</p> : (
        <>
          <h2 id="task-h" tabIndex={-1} ref={heading} className="text-lg">{item.prompt}</h2>
          {item.kind === "mcq" && (
            <div className="space-y-2" role="group" aria-labelledby="task-h">
              {item.choices!.map((c, i) => <button key={i} type="button" className={`btn w-full justify-start ${prev?.kind === "mcq" && prev.choice === i ? "btn-primary" : ""}`} onClick={() => answer({ kind: "mcq", choice: i })}>{c}</button>)}
            </div>
          )}
          {item.kind === "short_answer" && <ShortAnswer key={item.id} onDone={(text, selfLevel) => answer({ kind: "short_answer", text, selfLevel })} />}
          {item.kind === "code" && (
            <div className="space-y-2 text-sm">
              <p>Open the <Link href={`/lab/exercises/${item.exercise}`} target="_blank">practice exercise</Link> in a new tab, run its practice checks, then say how it went. This is self-reported and only shapes your skill map.</p>
              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn" onClick={() => answer({ kind: "code", practicePassed: true })}>All practice checks passed</button>
                <button type="button" className="btn" onClick={() => answer({ kind: "code", practicePassed: false })}>Some failed</button>
              </div>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn" onClick={() => answer({ kind: "idk" })}>I don&apos;t know</button>
            {index > 0 && <button type="button" className="btn" onClick={() => setIndex(index - 1)}>Previous</button>}
          </div>
          <p role="status" className="text-sm text-[var(--ink-muted)]">{saveState}</p>
        </>
      )}
    </section>
  );
}

function ShortAnswer({ onDone }: { onDone: (text: string, level: "missing" | "partial" | "competent" | "strong" | null) => void }) {
  const [text, setText] = useState("");
  const [level, setLevel] = useState<"missing" | "partial" | "competent" | "strong" | null>(null);
  return (
    <div className="space-y-2">
      <label htmlFor="sa" className="block text-sm">Your answer</label>
      <textarea id="sa" className="h-32 w-full rounded border border-[var(--border)] bg-[var(--surface)] p-2" value={text} onChange={(e) => setText(e.target.value)} />
      <fieldset><legend className="text-sm">Rate your own answer (self-assessed)</legend>
        <div className="flex flex-wrap gap-3">{(["missing", "partial", "competent", "strong"] as const).map((l) => <label key={l} className="flex min-h-6 items-center gap-1"><input type="radio" name="sa-level" checked={level === l} onChange={() => setLevel(l)} /> {l}</label>)}</div>
      </fieldset>
      <button type="button" className="btn btn-primary" disabled={!text.trim()} onClick={() => onDone(text, level)}>Next</button>
    </div>
  );
}
