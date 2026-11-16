import type { ReactNode } from "react";

/** The six states every page must handle (E.4). One component so pages can't forget a state. */
export type PageStateProps =
  | { state: "loading"; label?: string }
  | { state: "empty"; title: string; action?: ReactNode; children?: ReactNode }
  | { state: "error"; what: string; dataSafe: boolean; retry?: ReactNode }
  | { state: "offline" }
  | { state: "locked"; gate: string; preview?: ReactNode }
  | { state: "not-built"; phase: string; what: string };

export function PageState(p: PageStateProps) {
  switch (p.state) {
    case "loading":
      return (
        <div role="status" aria-live="polite" aria-busy="true" className="space-y-3">
          <span className="sr-only">{p.label ?? "Loading"}</span>
          <div className="skeleton h-6 w-1/3" />
          <div className="skeleton h-4 w-2/3" />
          <div className="skeleton h-4 w-1/2" />
        </div>
      );
    case "empty":
      return (
        <section className="panel" aria-labelledby="empty-title">
          <h2 id="empty-title" className="font-serif text-xl">{p.title}</h2>
          {p.children}
          {p.action ? <div className="mt-4">{p.action}</div> : null}
        </section>
      );
    case "error":
      return (
        <section role="alert" className="panel border-[var(--danger)]">
          <h2 className="font-serif text-xl">Something failed: {p.what}</h2>
          <p className="mt-2 text-[var(--ink-muted)]">{p.dataSafe ? "Your saved data is safe." : "Recent unsaved changes may be lost."}</p>
          {p.retry ? <div className="mt-4">{p.retry}</div> : null}
        </section>
      );
    case "offline":
      return (
        <section role="status" className="panel">
          <h2 className="font-serif text-xl">You are offline</h2>
          <p className="mt-2 text-[var(--ink-muted)]">Showing cached data, read-only. Changes are disabled until the connection returns.</p>
        </section>
      );
    case "locked":
      return (
        <section className="panel" aria-labelledby="locked-title">
          <h2 id="locked-title" className="font-serif text-xl">Locked</h2>
          <p className="mt-2">Unlocks after <strong>{p.gate}</strong>. Hours logged never unlock anything; only passed gates do.</p>
          {p.preview ? <div className="mt-4 opacity-80">{p.preview}</div> : null}
        </section>
      );
    case "not-built":
      return (
        <section className="panel" aria-labelledby="nb-title">
          <h2 id="nb-title" className="font-serif text-xl">Not built yet</h2>
          <p className="mt-2">{p.what} arrives in phase {p.phase}. Nothing on this page is functional yet.</p>
        </section>
      );
  }
}

/** Persistent banner for mock records (G §0.5). */
export function MockBanner() {
  return (
    <div role="note" className="mock-banner">
      <strong>SAMPLE DATA</strong> — records on this page are marked is_mock and never count in meters, the portfolio or reports.
    </div>
  );
}
