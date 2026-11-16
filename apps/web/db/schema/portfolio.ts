import { bigint, boolean, index, json, mysqlEnum, mysqlTable, uniqueIndex, varchar } from "drizzle-orm/mysql-core";
import { user } from "./auth.ts";
import { createdAt, dt, id, userIdCol } from "./_helpers.ts";

const userFk = () => userIdCol().notNull().references(() => user.id, { onDelete: "cascade" });

export const portfolioItems = mysqlTable(
  "portfolio_items",
  {
    id: id(),
    userId: userFk(),
    kind: varchar("kind", { length: 32 }).notNull(),
    refId: bigint("ref_id", { mode: "number", unsigned: true }).notNull(),
    slug: varchar("slug", { length: 120 }).notNull(),
    published: boolean("published").notNull().default(false),
    checksJson: json("checks_json"),
    publishedAt: dt("published_at"),
    evidenceVerifiedAt: dt("evidence_verified_at"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("portfolio_user_slug_uq").on(t.userId, t.slug)],
);

export const writingDrafts = mysqlTable(
  "writing_drafts",
  {
    id: id(),
    userId: userFk(),
    kind: mysqlEnum("kind", ["linkedin", "resume_bullet", "blog"]).notNull(),
    sentencesJson: json("sentences_json").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("writing_drafts_user_idx").on(t.userId)],
);
