/** One meter with its formula and evidence (C.6). Meters are never merged into one number. */
export function LearningMeter({ m }: { m: { gatesPassed: number; gatesInMode: number; retention: number | null; reviewsCounted: number; formula: string; evidence: string[] } }) {
  const pct = m.gatesInMode ? Math.round((m.gatesPassed / m.gatesInMode) * 100) : 0;
  return (
    <section className="panel" aria-labelledby="meter-learning">
      <h2 id="meter-learning" className="text-lg">Learning progress</h2>
      <p className="num mt-2 text-2xl">{m.gatesPassed} / {m.gatesInMode} gates</p>
      <div className="mt-2 h-2 rounded bg-[var(--surface-2)]" role="progressbar" aria-valuemin={0} aria-valuemax={m.gatesInMode} aria-valuenow={m.gatesPassed} aria-label="Gates passed">
        <div className="h-2 rounded bg-[var(--accent)]" style={{ width: `${pct}%` }} />
      </div>
      <p className="num mt-2 text-sm">Retention (30 days): {m.retention === null ? "no reviews yet" : `${Math.round(m.retention * 100)}% of ${m.reviewsCounted} reviews`}</p>
      <details className="mt-2 text-sm">
        <summary>How is this computed?</summary>
        <p className="mt-1">{m.formula}. Evidence: {m.evidence.length ? m.evidence.join(", ") : "no gates passed yet"}. Sample data never counts.</p>
      </details>
    </section>
  );
}
