import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "../../../db/client.ts";
import { papers, sources } from "../../../db/schema/index.ts";

export type PaperRow = typeof papers.$inferSelect;

/**
 * FULLTEXT boolean query from user text: operators and quotes are stripped, every word becomes a required prefix
 * term (`+word*`). MySQL treats the result as data, and the query is bound as a parameter.
 */
export function booleanQuery(q: string): string | null {
  const words = q.normalize("NFKC").replace(/[^\p{L}\p{N}_\s-]/gu, " ").split(/[\s-]+/).filter((w) => w.length >= 2).slice(0, 12);
  return words.length ? words.map((w) => `+${w}*`).join(" ") : null;
}

const columns = {
  id: papers.id, title: papers.title, abstract: papers.abstract, authorsJson: papers.authorsJson, userNotes: papers.userNotes, status: papers.status,
  isMock: papers.isMock, createdAt: papers.createdAt, updatedAt: papers.updatedAt, sourceId: papers.sourceId, url: sources.url, verification: sources.verification,
  verifiedAt: sources.verifiedAt, lastCheckedAt: sources.lastCheckedAt, verifyNote: sources.verifyNote, externalId: sources.externalId,
};

/** The user's papers, optionally filtered by a FULLTEXT search over title, abstract and notes (AT-26). */
export async function listPapers(userId: string, q?: string) {
  const db = getDb();
  const bq = q ? booleanQuery(q) : null;
  const base = db.select(columns).from(papers).innerJoin(sources, eq(sources.id, papers.sourceId));
  if (q && !bq) return [];
  if (!bq) return base.where(eq(papers.userId, userId)).orderBy(desc(papers.updatedAt));
  const match = sql`MATCH(${papers.title}, ${papers.abstract}, ${papers.userNotes}) AGAINST (${bq} IN BOOLEAN MODE)`;
  return base.where(and(eq(papers.userId, userId), match)).orderBy(desc(match));
}

export async function paperById(id: number) {
  return (await getDb().select().from(papers).where(eq(papers.id, id)).limit(1))[0];
}

export async function paperOf(userId: string, sourceId: number) {
  return (await getDb().select().from(papers).where(and(eq(papers.userId, userId), eq(papers.sourceId, sourceId))).limit(1))[0];
}

export async function insertPaper(v: typeof papers.$inferInsert) {
  const [res] = await getDb().insert(papers).values(v);
  return Number((res as unknown as { insertId: number }).insertId);
}

export async function updatePaper(id: number, set: Partial<Pick<PaperRow, "userNotes" | "status" | "title">>) {
  if (Object.keys(set).length) await getDb().update(papers).set(set).where(eq(papers.id, id));
}

export async function deletePaper(id: number) {
  await getDb().delete(papers).where(eq(papers.id, id));
}
