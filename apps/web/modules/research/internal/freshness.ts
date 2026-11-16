/** NFR-8 / AT-12: every resource shows verified_at; older than 30 days shows "stale, re-check". */
export const STALE_AFTER_DAYS = 30;
export type Freshness = "fresh" | "stale" | "unverified" | "broken";

export function freshness(s: { verification: string; verifiedAt: Date | null }, now: Date): Freshness {
  if (s.verification === "broken") return "broken";
  if (s.verification === "unverified" || !s.verifiedAt) return "unverified";
  return now.getTime() - s.verifiedAt.getTime() > STALE_AFTER_DAYS * 86_400_000 ? "stale" : "fresh";
}
