import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { attempts, papers, sources, user } from "../../db/schema/index.ts";
import { seed } from "../../modules/learning/service.ts";
import { testEnv } from "./helpers.ts";

const { db } = testEnv();
const uid = randomUUID();

beforeAll(async () => {
  await seed(); // curriculum rows (weeks, gates) come from content/
  await db.insert(user).values({ id: uid, name: "schema", email: `schema-${uid.slice(0, 8)}@example.test` });
});

const violation = async (p: Promise<unknown>) => {
  try { await p; return "no error"; } catch (e) { return String((e as { cause?: { message?: string } }).cause?.message ?? e); }
};
const attempt = (source: "browser" | "runner", status: "practice" | "passed") =>
  db.insert(attempts).values({ userId: uid, gateId: "g-w01", source, status, passed: true, contentVersion: "v0" });

describe("migrations on MySQL 8.4", () => {
  it("creates every app table", async () => {
    const [rows] = await db.execute(sql`SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name <> '__drizzle_migrations'`);
    expect(Number((rows as unknown as { n: number }[])[0]!.n)).toBe(51);
  });
  it("innodb_ft_min_token_size is 2", async () => {
    const [rows] = await db.execute(sql`SELECT @@innodb_ft_min_token_size AS v`);
    expect(Number((rows as unknown as { v: number }[])[0]!.v)).toBe(2);
  });
});

describe("X-13 (DB layer): browser results can only be practice checks", () => {
  it("accepts browser + practice", async () => await expect(attempt("browser", "practice")).resolves.toBeDefined());
  it("rejects browser + passed", async () => expect(await violation(attempt("browser", "passed"))).toMatch(/attempts_browser_is_practice/));
  it("rejects runner + practice", async () => expect(await violation(attempt("runner", "practice"))).toMatch(/attempts_practice_is_browser/));
  it("accepts runner + passed", async () => await expect(attempt("runner", "passed")).resolves.toBeDefined());
});

describe("FULLTEXT on papers indexes two-letter terms", () => {
  it("finds a paper by 'KV'", async () => {
    const [s] = await db.insert(sources).values({ kind: "paper", url: "https://arxiv.org/abs/2310.07240", urlHash: "b".repeat(64), title: "CacheGen", verification: "verified", verifiedAt: new Date(), lastCheckedAt: new Date() }).$returningId();
    await db.insert(papers).values({ userId: uid, sourceId: s!.id, title: "CacheGen: KV Cache Compression and Streaming", abstract: "We compress the KV cache." });
    const [rows] = await db.execute(sql`SELECT title FROM papers WHERE MATCH(title, abstract, user_notes) AGAINST ('KV' IN NATURAL LANGUAGE MODE)`);
    expect((rows as unknown as { title: string }[]).map((r) => r.title)).toContain("CacheGen: KV Cache Compression and Streaming");
  });
});
