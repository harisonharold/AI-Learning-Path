"use client";
import { type ReactNode, useId, useRef, useState, useSyncExternalStore } from "react";

const subscribe = (cb: () => void) => { window.addEventListener("hashchange", cb); return () => window.removeEventListener("hashchange", cb); };

/** WAI-ARIA tabs: arrow keys move between tabs, Home/End jump, panels are focusable. The selected tab is kept in the
 * URL hash so a reload or a shared link returns to it. */
export function Tabs({ tabs, label }: { tabs: { id: string; title: string; content: ReactNode }[]; label: string }) {
  const base = useId();
  const hash = useSyncExternalStore(subscribe, () => window.location.hash.slice(1), () => "");
  const [picked, setPicked] = useState<string | null>(null);
  const active = picked ?? (tabs.some((t) => t.id === hash) ? hash : tabs[0]!.id);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const select = (i: number) => {
    const t = tabs[(i + tabs.length) % tabs.length]!;
    setPicked(t.id);
    refs.current[(i + tabs.length) % tabs.length]?.focus();
    history.replaceState(null, "", `#${t.id}`);
  };
  const idx = tabs.findIndex((t) => t.id === active);
  return (
    <div>
      <div role="tablist" aria-label={label} className="flex flex-wrap gap-1 border-b border-[var(--border)]">
        {tabs.map((t, i) => (
          <button key={t.id} ref={(el) => { refs.current[i] = el; }} type="button" role="tab" id={`${base}-${t.id}-tab`} aria-controls={`${base}-${t.id}`}
            aria-selected={t.id === active} tabIndex={t.id === active ? 0 : -1}
            className={`rounded-t px-3 py-2 text-sm ${t.id === active ? "border border-b-0 border-[var(--border)] bg-[var(--surface)] font-semibold" : "text-[var(--ink-muted)]"}`}
            onClick={() => select(i)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight") { e.preventDefault(); select(idx + 1); }
              else if (e.key === "ArrowLeft") { e.preventDefault(); select(idx - 1); }
              else if (e.key === "Home") { e.preventDefault(); select(0); }
              else if (e.key === "End") { e.preventDefault(); select(tabs.length - 1); }
            }}>
            {t.title}
          </button>
        ))}
      </div>
      {tabs.map((t) => (
        <div key={t.id} role="tabpanel" id={`${base}-${t.id}`} aria-labelledby={`${base}-${t.id}-tab`} tabIndex={0} hidden={t.id !== active} className="pt-4">
          {t.content}
        </div>
      ))}
    </div>
  );
}
