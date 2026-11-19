import "server-only";
import { asc, desc, eq, inArray, isNull, lt, or } from "drizzle-orm";
import { getDb } from "../../../db/client.ts";
import { papers, sources } from "../../../db/schema/index.ts";

export type SourceRow = typeof sources.$inferSelect;

/** What worker-node reports for one source (apps/worker-node/src/verify.ts). */
export interface VerifyOutcome {
  sourceId: number;
  verification: "verified" | "partial" | "broken" | "unchanged";
  method: string;
  note: string;
  finalUrl?: string | null;
  title?: string | null;
  externalId?: string | null;
  licence?: string | null;
  lastActivityAt?: string | null;
  blockReason?: string | null;
  raw?: Record<string, unknown> | null;
}

export async function sourceById(id: number) {
  return (await getDb().select().from(sources).where(eq(sources.id, id)).limit(1))[0];
}

/** Sources not checked for `olderThanHours` (oldest first), for the nightly sweep. */
export async function dueSources(olderThanHours: number, limit: number, now = new Date()) {
  const cutoff = new Date(now.getTime() - olderThanHours * 3_600_000);
  return getDb().select({ id: sources.id, url: sources.url, kind: sources.kind, externalId: sources.externalId }).from(sources)
    .where(or(lt(sources.lastCheckedAt, cutoff), isNull(sources.verifiedAt))).orderBy(asc(sources.lastCheckedAt)).limit(limit);
}

const date = (s: string | null | undefined) => (s && !Number.isNaN(Date.parse(s)) ? new Date(s) : null);

/**
 * Applies a verification outcome. Only API- or page-returned facts are written (no invented data, T-V4).
 * `unchanged` (rate limit, timeout, server error) records the attempt but never downgrades the stored status.
 * Paper titles, authors and abstracts come only from the arXiv API response.
 */
export async function applyVerification(o: VerifyOutcome, now = new Date()) {
  const db = getDb();
  const s = await sourceById(o.sourceId);
  if (!s) return;
  if (o.verification === "unchanged") {
    await db.update(sources).set({ lastCheckedAt: now, verifyNote: `${now.toISOString().slice(0, 10)} check inconclusive (${o.note}); previous status kept` }).where(eq(sources.id, s.id));
    return;
  }
  const checked = o.verification === "verified" || o.verification === "partial";
  const arxiv = o.method === "arXiv export API" && o.verification === "verified";
  await db.update(sources).set({
    verification: o.verification,
    verifiedAt: checked ? now : s.verifiedAt,
    lastCheckedAt: now,
    verifyMethod: o.method.slice(0, 100),
    verifyNote: o.note,
    finalUrl: o.finalUrl ?? s.finalUrl,
    fetchBlockReason: o.verification === "broken" ? (o.blockReason ?? null) : null,
    rawJson: o.raw ?? s.rawJson,
    ...(o.licence !== undefined && s.kind === "repo" ? { licence: o.licence } : {}),
    ...(o.lastActivityAt ? { lastActivityAt: date(o.lastActivityAt) } : {}),
    // Curated titles of docs and courses stay; a paper's title is the one arXiv returns (AT-22).
    ...(arxiv && o.title ? { title: o.title.slice(0, 500) } : {}),
  }).where(eq(sources.id, s.id));
  if (arxiv && o.title) {
    const raw = o.raw ?? {};
    await db.update(papers).set({ title: o.title.slice(0, 500), abstract: typeof raw.abstract === "string" ? raw.abstract : null, authorsJson: Array.isArray(raw.authors) ? raw.authors : null })
      .where(eq(papers.sourceId, s.id));
  }
}

/** Most recent check of any source: the "last verification run" shown in Settings and on the paper library. */
export async function latestCheck() {
  const r = await getDb().select({ at: sources.lastCheckedAt }).from(sources).orderBy(desc(sources.lastCheckedAt)).limit(1);
  return r[0]?.at ?? null;
}

export async function sourcesByIds(ids: number[]) {
  if (!ids.length) return [];
  return getDb().select().from(sources).where(inArray(sources.id, ids));
}

export async function findSourceByUrlHash(hash: string) {
  return (await getDb().select().from(sources).where(eq(sources.urlHash, hash)).limit(1))[0];
}

export async function insertSource(v: typeof sources.$inferInsert) {
  const [res] = await getDb().insert(sources).values(v);
  return Number((res as unknown as { insertId: number }).insertId);
}

