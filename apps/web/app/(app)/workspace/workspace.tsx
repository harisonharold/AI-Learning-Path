"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

type Card = { id: number; front: string; back: string };
type Task = { kind: string; title: string; minutes: number; href: string };
const RATINGS = [[1, "Again"], [2, "Hard"], [3, "Good"], [4, "Easy"]] as const;

export function Workspace({ cards, plan, weekId }: { cards: Card[]; plan: Task[]; weekId: string }) {
  const [i, setI] = useState(0);
  const [shown, setShown] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const quizDone = i >= cards.length;
  const card = cards[i];

  const rate = useCallback(async (rating: 1 | 2 | 3 | 4) => {
    if (!card || !shown) return;
    const r = await fetch(`/api/cards/${card.id}/review`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ rating }) });
    if (!r.ok) { setErr(`Could not save the review (HTTP ${r.status}). Try again; nothing else changed.`); return; }
    setErr(null);
    setShown(false);
    setI((x) => x + 1);
  }, [card, shown]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (quizDone || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName) || e.ctrlKey || e.metaKey) return;
      if (e.key === " " && !shown) { e.preventDefault(); setShown(true); }
      if (shown && ["1", "2", "3", "4"].includes(e.key)) { e.preventDefault(); void rate(Number(e.key) as 1 | 2 | 3 | 4); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [quizDone, shown, rate]);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
      <section className="panel" aria-labelledby="quiz-title">
        <h2 id="quiz-title" className="text-xl">1. Retrieval quiz</h2>
        {cards.length === 0 ? <p className="mt-2">No cards are due from earlier weeks. Add must-know cards from a lesson; they come back here once you move past that week.</p>
          : quizDone ? <p role="status" className="mt-2">Done: {cards.length} card(s) reviewed. Your tasks are unlocked.</p>
          : (
            <div className="mt-3 space-y-3">
              <p className="num text-sm text-[var(--ink-muted)]">Card {i + 1} of {cards.length}</p>
              <p className="text-lg" data-testid="card-front">{card!.front}</p>
              {shown ? <p data-testid="card-back" className="rounded bg-[var(--surface-2)] p-3">{card!.back}</p>
                : <button type="button" className="btn" onClick={() => setShown(true)} autoFocus>Show answer <kbd>Space</kbd></button>}
              {shown && (
                <div className="flex flex-wrap gap-2" role="group" aria-label="How well did you recall it?">
                  {RATINGS.map(([n, label]) => <button key={n} type="button" className="btn" onClick={() => rate(n)} autoFocus={n === 3}>{label} <kbd>{n}</kbd></button>)}
                </div>
              )}
              {err && <p role="alert" className="text-[var(--danger)]">{err}</p>}
            </div>
          )}
      </section>
      <section className="panel" aria-labelledby="tasks-title">
        <h2 id="tasks-title" className="text-xl">2. Today&apos;s tasks</h2>
        {!quizDone ? <p className="mt-2 text-[var(--ink-muted)]">Finish the retrieval quiz first (10-15 minutes).</p> : (
          <ul className="mt-3 space-y-3" data-keylist>{plan.map((t) => <TaskRow key={t.href + t.title} task={t} weekId={weekId} />)}</ul>
        )}
        <p className="mt-4 text-sm text-[var(--ink-muted)]">Stuck? The Socratic mentor arrives in phase P5. Until then, use the hint ladder on exercises.</p>
      </section>
    </div>
  );
}

function TaskRow({ task, weekId }: { task: Task; weekId: string }) {
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [logged, setLogged] = useState<string | null>(null);
  const started = useRef<number>(0);
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - started.current) / 1000)), 1000);
    return () => clearInterval(t);
  }, [running]);
  const category = task.kind === "lesson" ? "theory" : task.kind === "exercise" ? "exercise" : "lab";
  async function stop() {
    setRunning(false);
    const minutes = Math.max(1, Math.round((Date.now() - started.current) / 60000));
    const r = await fetch("/api/time-logs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ weekId, minutes, category, source: "timer" }) });
    setLogged(r.ok ? `Logged ${minutes} min (time is shown, never used to unlock).` : "Could not log time.");
  }
  return (
    <li className="flex flex-wrap items-center justify-between gap-2">
      <Link href={task.href} data-keylist-item>{task.title}</Link>
      <span className="flex items-center gap-2 text-sm">
        <span className="num" aria-live="off">{Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")} / {task.minutes}:00</span>
        {running ? <button type="button" className="btn" onClick={stop}>Stop timer</button>
          : <button type="button" className="btn" onClick={() => { started.current = Date.now(); setElapsed(0); setRunning(true); setLogged(null); }}>Start timer</button>}
        {logged && <span role="status">{logged}</span>}
      </span>
    </li>
  );
}
