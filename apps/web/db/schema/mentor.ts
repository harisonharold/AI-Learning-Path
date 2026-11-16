import { char, date, decimal, index, int, json, mediumtext, mysqlEnum, mysqlTable, primaryKey, text, varchar } from "drizzle-orm/mysql-core";
import { user } from "./auth.ts";
import { attempts, skills } from "./learning.ts";
import { sources } from "./research.ts";
import { createdAt, dt, fk, id, userIdCol } from "./_helpers.ts";

const userFk = () => userIdCol().notNull().references(() => user.id, { onDelete: "cascade" });

export const mentorThreads = mysqlTable(
  "mentor_threads",
  {
    id: char("id", { length: 36 }).primaryKey(),
    userId: userFk(),
    mode: varchar("mode", { length: 32 }).notNull(),
    contextKind: varchar("context_kind", { length: 32 }),
    contextId: varchar("context_id", { length: 64 }),
    createdAt: createdAt(),
  },
  (t) => [index("mentor_threads_user_idx").on(t.userId)],
);

export const mentorMessages = mysqlTable(
  "mentor_messages",
  {
    id: id(),
    userId: userFk(),
    threadId: char("thread_id", { length: 36 }).notNull().references(() => mentorThreads.id, { onDelete: "cascade" }),
    role: mysqlEnum("role", ["user", "assistant"]).notNull(),
    mode: varchar("mode", { length: 32 }).notNull(),
    content: mediumtext("content").notNull(),
    citedSourceIds: json("cited_source_ids").$type<number[]>(),
    confidence: mysqlEnum("confidence", ["high", "medium", "low"]),
    policyFlags: json("policy_flags"),
    provider: varchar("provider", { length: 40 }),
    model: varchar("model", { length: 80 }),
    inputTokens: int("input_tokens"),
    outputTokens: int("output_tokens"),
    costUsd: decimal("cost_usd", { precision: 10, scale: 5 }),
    createdAt: createdAt(),
  },
  (t) => [index("mentor_messages_thread_idx").on(t.threadId, t.createdAt)],
);

export const aiBudgets = mysqlTable("ai_budgets", {
  userId: userIdCol().primaryKey().references(() => user.id, { onDelete: "cascade" }),
  dailyUsd: decimal("daily_usd", { precision: 8, scale: 2 }).notNull().default("0.50"),
  monthlyUsd: decimal("monthly_usd", { precision: 8, scale: 2 }).notNull().default("5.00"),
  perRequestMaxOutputTokens: int("per_request_max_output_tokens").notNull().default(2048),
  spentToday: decimal("spent_today", { precision: 10, scale: 5 }).notNull().default("0"),
  spentMonth: decimal("spent_month", { precision: 10, scale: 5 }).notNull().default("0"),
  periodDay: date("period_day"),
  periodMonth: char("period_month", { length: 7 }),
});

export const aiSpendLedger = mysqlTable(
  "ai_spend_ledger",
  {
    id: id(),
    userId: userFk(),
    messageId: fk("message_id").references(() => mentorMessages.id, { onDelete: "set null" }),
    kind: mysqlEnum("kind", ["reservation", "settlement", "release"]).notNull(),
    usd: decimal("usd", { precision: 10, scale: 5 }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("ai_ledger_user_created_idx").on(t.userId, t.createdAt)],
);

export const priceTable = mysqlTable(
  "price_table",
  {
    provider: varchar("provider", { length: 40 }).notNull(),
    model: varchar("model", { length: 80 }).notNull(),
    inputPerMtok: decimal("input_per_mtok", { precision: 10, scale: 4 }).notNull(),
    outputPerMtok: decimal("output_per_mtok", { precision: 10, scale: 4 }).notNull(),
    maxPromptTokensForRate: int("max_prompt_tokens_for_rate"),
    sourceId: fk("source_id").references(() => sources.id),
    sourceUrl: varchar("source_url", { length: 500 }).notNull(),
    verifiedAt: dt("verified_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.provider, t.model] })],
);

export const weaknesses = mysqlTable(
  "weaknesses",
  {
    id: id(),
    userId: userFk(),
    skillId: varchar("skill_id", { length: 64 }).notNull().references(() => skills.id),
    observation: text("observation").notNull(),
    evidenceRef: varchar("evidence_ref", { length: 300 }),
    origin: mysqlEnum("origin", ["mentor", "gate"]).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("weaknesses_user_idx").on(t.userId)],
);

export const interviewSessions = mysqlTable(
  "interview_sessions",
  {
    id: id(),
    userId: userFk(),
    kind: mysqlEnum("kind", ["coding", "system_design", "defend", "behavioural"]).notNull(),
    startedAt: createdAt(),
    endedAt: dt("ended_at"),
    transcriptMd: mediumtext("transcript_md"),
    recordingRef: varchar("recording_ref", { length: 300 }),
    attemptId: fk("attempt_id").references(() => attempts.id, { onDelete: "set null" }),
  },
  (t) => [index("interview_user_idx").on(t.userId)],
);
