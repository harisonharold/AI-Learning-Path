import { boolean, char, index, json, mysqlEnum, mysqlTable, primaryKey, text, tinyint, uniqueIndex, varbinary, varchar } from "drizzle-orm/mysql-core";
import { user } from "./auth.ts";
import { createdAt, dt, id, updatedAt, userIdCol } from "./_helpers.ts";

const userFk = () => userIdCol().notNull().references(() => user.id, { onDelete: "cascade" });

export const profiles = mysqlTable("profiles", {
  userId: userIdCol().primaryKey().references(() => user.id, { onDelete: "cascade" }),
  handle: varchar("handle", { length: 39 }).notNull().unique(),
  displayName: varchar("display_name", { length: 200 }),
  bio: text("bio"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const userRoles = mysqlTable(
  "user_roles",
  { userId: userFk(), role: mysqlEnum("role", ["learner", "reviewer", "admin"]).notNull(), createdAt: createdAt() },
  (t) => [primaryKey({ columns: [t.userId, t.role] })],
);

export const userSettings = mysqlTable("user_settings", {
  userId: userIdCol().primaryKey().references(() => user.id, { onDelete: "cascade" }),
  mode: mysqlEnum("mode", ["ACC", "RI"]),
  hoursPerWeek: tinyint("hours_per_week"),
  timezone: varchar("timezone", { length: 64 }).notNull().default("America/Toronto"),
  theme: mysqlEnum("theme", ["system", "light", "dark"]).notNull().default("system"),
  sampleData: boolean("sample_data").notNull().default(false),
  aiProvider: mysqlEnum("ai_provider", ["none", "anthropic"]).notNull().default("none"),
  aiModel: varchar("ai_model", { length: 80 }),
  a11yPauseTimers: boolean("a11y_pause_timers").notNull().default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const aiCredentials = mysqlTable(
  "ai_credentials",
  {
    id: id(),
    userId: userFk(),
    provider: mysqlEnum("provider", ["anthropic"]).notNull(),
    keyEnc: varbinary("key_enc", { length: 1024 }).notNull(),
    keyId: tinyint("key_id").notNull(),
    keyLast4: char("key_last4", { length: 4 }).notNull(),
    createdAt: createdAt(),
    revokedAt: dt("revoked_at"),
  },
  (t) => [uniqueIndex("ai_credentials_user_provider_uq").on(t.userId, t.provider)],
);

export const runnerTokens = mysqlTable(
  "runner_tokens",
  {
    id: id(),
    userId: userFk(),
    tokenPrefix: char("token_prefix", { length: 8 }).notNull(),
    tokenHash: char("token_hash", { length: 64 }).notNull(),
    scopes: json("scopes").$type<string[]>().notNull(),
    expiresAt: dt("expires_at").notNull(),
    revoked: boolean("revoked").notNull().default(false),
    lastUsedAt: dt("last_used_at"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("runner_tokens_hash_uq").on(t.tokenHash), index("runner_tokens_user_idx").on(t.userId)],
);

export const jobs = mysqlTable(
  "jobs",
  {
    id: char("id", { length: 36 }).primaryKey(),
    userId: userIdCol().references(() => user.id, { onDelete: "cascade" }),
    kind: varchar("kind", { length: 64 }).notNull(),
    status: mysqlEnum("status", ["queued", "running", "done", "failed"]).notNull().default("queued"),
    attempts: tinyint("attempts").notNull().default(0),
    payloadJson: json("payload_json"),
    resultJson: json("result_json"),
    error: text("error"),
    createdAt: createdAt(),
    finishedAt: dt("finished_at"),
  },
  (t) => [index("jobs_user_created_idx").on(t.userId, t.createdAt), index("jobs_status_idx").on(t.status)],
);

export const auditLog = mysqlTable(
  "audit_log",
  {
    id: id(),
    userId: userIdCol().references(() => user.id, { onDelete: "set null" }),
    action: varchar("action", { length: 100 }).notNull(),
    target: varchar("target", { length: 300 }),
    metaJson: json("meta_json"),
    ipHash: char("ip_hash", { length: 64 }),
    createdAt: createdAt(),
  },
  (t) => [index("audit_user_created_idx").on(t.userId, t.createdAt)],
);

