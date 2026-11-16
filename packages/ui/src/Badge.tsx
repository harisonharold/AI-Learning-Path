import type { ReactNode } from "react";

/** Semantic badges always pair an icon with text, never colour alone (E.1). */
export type BadgeKind = "verified" | "self" | "ai" | "mock" | "stale" | "practice" | "unverified";

const META: Record<BadgeKind, { label: string; color: string; icon: ReactNode }> = {
  verified: { label: "Verified", color: "var(--verified)", icon: <path d="M3 8.5l3 3 7-7" /> },
  self: { label: "Self-assessed", color: "var(--self)", icon: <circle cx="8" cy="8" r="5" /> },
  ai: { label: "AI-generated", color: "var(--ai)", icon: <path d="M8 2l1.8 4.2L14 8l-4.2 1.8L8 14l-1.8-4.2L2 8l4.2-1.8z" /> },
  mock: { label: "Sample data", color: "var(--mock)", icon: <path d="M2 14L14 2M2 8l6-6M8 14l6-6" /> },
  stale: { label: "Stale — re-check", color: "var(--stale)", icon: <path d="M8 3v5l3 2M8 15A7 7 0 108 1a7 7 0 000 14z" /> },
  practice: { label: "Practice check — doesn't count toward gates", color: "var(--self)", icon: <path d="M3 3h10v10H3z" /> },
  unverified: { label: "Unverified", color: "var(--stale)", icon: <path d="M8 4v5M8 11.5v.5" /> },
};

export function Badge({ kind, children }: { kind: BadgeKind; children?: ReactNode }) {
  const m = META[kind];
  return (
    <span
      data-badge={kind}
      className="inline-flex min-h-6 items-center gap-1 rounded border px-1.5 text-xs font-medium"
      style={{ color: m.color, borderColor: m.color }}
    >
      <svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        {m.icon}
      </svg>
      <span>{children ?? m.label}</span>
    </span>
  );
}
