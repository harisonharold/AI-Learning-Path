/** Week/gate state with icon + text, never colour alone (E.1). */
const META: Record<string, { label: string; color: string; glyph: string }> = {
  passed: { label: "Passed", color: "var(--verified)", glyph: "✓" },
  available: { label: "Available", color: "var(--self)", glyph: "○" },
  in_progress: { label: "In progress", color: "var(--self)", glyph: "◐" },
  pending_evidence: { label: "Pending evidence", color: "var(--amber)", glyph: "◐" },
  not_started: { label: "Not started", color: "var(--ink-muted)", glyph: "○" },
  remediation: { label: "Remediation", color: "var(--stale)", glyph: "↺" },
  failed: { label: "Failed", color: "var(--danger)", glyph: "✕" },
  locked: { label: "Locked", color: "var(--ink-muted)", glyph: "🔒︎" },
};
export function StateBadge({ state }: { state: string }) {
  const m = META[state] ?? { label: state, color: "var(--ink-muted)", glyph: "•" };
  return (
    <span data-state={state} className="inline-flex min-h-6 items-center gap-1 rounded border px-1.5 text-xs font-medium" style={{ color: m.color, borderColor: m.color }}>
      <span aria-hidden="true">{m.glyph}</span>
      <span>{m.label}</span>
    </span>
  );
}
