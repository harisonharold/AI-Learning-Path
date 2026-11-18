import { sql } from "drizzle-orm";
import { bigint, boolean, char, check, date, double, index, int, json, mediumtext, mysqlEnum, mysqlTable, primaryKey, smallint, text, tinyint, uniqueIndex, varchar } from "drizzle-orm/mysql-core";
import { user } from "./auth.ts";
import { runnerTokens } from "./platform.ts";
import { createdAt, dt, fk, id, isMock, updatedAt, userIdCol } from "./_helpers.ts";

const userFk = () => userIdCol().notNull().references(() => user.id, { onDelete: "cascade" });

export const sources = mysqlTable(
  "sources",
  {
    id: id(),
    kind: mysqlEnum("kind", ["paper", "repo", "course", "doc", "price", "issue", "job", "blog"]).notNull(),
    url: varchar("url", { length: 2048 }).notNull(),
    urlHash: char("url_hash", { length: 64 }).notNull(),
    finalUrl: varchar("final_url", { length: 2048 }),
    title: varchar("title", { length: 500 }),
    venue: varchar("venue", { length: 200 }),
    year: smallint("year"),
    externalId: varchar("external_id", { length: 100 }),
    licence: varchar("licence", { length: 100 }),
    lastActivityAt: dt("last_activity_at"),
    verification: mysqlEnum("verification", ["verified", "partial", "unverified", "broken"]).notNull(),
    verifiedAt: dt("verified_at"),
    lastCheckedAt: dt("last_checked_at").notNull(),
    verifyMethod: varchar("verify_method", { length: 100 }),
    verifyNote: text("verify_note"),
    fetchBlockReason: varchar("fetch_block_reason", { length: 64 }),
    rawJson: json("raw_json"),
    seedVerifiedAt: dt("seed_verified_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("sources_url_hash_uq").on(t.urlHash),
    uniqueIndex("sources_kind_external_uq").on(t.kind, t.externalId),
    index("sources_kind_idx").on(t.kind),
    index("sources_verified_at_idx").on(t.verifiedAt),
  ],
);

/** FULLTEXT(title, abstract, user_notes) is created in a hand-written migration (Drizzle has no MySQL FULLTEXT builder). */
export const papers = mysqlTable(
  "papers",
  {
    id: id(),
    userId: userFk(),
    sourceId: fk("source_id").notNull().references(() => sources.id),
    title: varchar("title", { length: 500 }).notNull(),
    abstract: text("abstract"),
    authorsJson: json("authors_json"),
    userNotes: mediumtext("user_notes"),
    analysisJson: json("analysis_json"),
    status: mysqlEnum("status", ["to_read", "read", "analysed"]).notNull().default("to_read"),
    isMock: isMock(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("papers_user_source_uq").on(t.userId, t.sourceId)],
);

export const dossiers = mysqlTable(
  "dossiers",
  {
    id: id(),
    slug: varchar("slug", { length: 100 }).notNull().unique(),
    title: varchar("title", { length: 300 }).notNull(),
    classification: mysqlEnum("classification", ["documented_open_problem", "engineering_opportunity", "unverified_hypothesis", "already_solved", "beginner_contribution"]).notNull(),
    fieldsJson: json("fields_json").notNull(),
    difficulty: tinyint("difficulty").notNull(),
    feasibility: tinyint("feasibility").notNull(),
    hardware: mysqlEnum("hardware", ["CPU", "GPU_FREE", "GPU_RENT", "MULTI_GPU"]).notNull(),
    overrideNote: text("override_note"),
    securitySensitive: boolean("security_sensitive").notNull().default(false),
    reviewedAt: dt("reviewed_at").notNull(),
  },
  (t) => [
    index("dossiers_classification_idx").on(t.classification),
    check("dossiers_difficulty_range", sql`${t.difficulty} BETWEEN 1 AND 5`),
    check("dossiers_feasibility_range", sql`${t.feasibility} BETWEEN 1 AND 5`),
  ],
);

export const dossierEvidence = mysqlTable(
  "dossier_evidence",
  {
    dossierId: fk("dossier_id").notNull().references(() => dossiers.id, { onDelete: "cascade" }),
    sourceId: fk("source_id").notNull().references(() => sources.id),
    claim: text("claim").notNull(),
    evidenceDate: date("evidence_date"),
    isPrimary: boolean("is_primary").notNull().default(false),
  },
  (t) => [primaryKey({ columns: [t.dossierId, t.sourceId] })],
);

export const projects = mysqlTable(
  "projects",
  {
    id: id(),
    userId: userFk(),
    dossierId: fk("dossier_id").references(() => dossiers.id),
    title: varchar("title", { length: 300 }).notNull(),
    hypothesis: text("hypothesis"),
    planMd: mediumtext("plan_md"),
    preregJson: json("prereg_json"),
    preregisteredAt: dt("preregistered_at"),
    status: mysqlEnum("status", ["draft", "running", "concluded", "abandoned"]).notNull().default("draft"),
    visibility: mysqlEnum("visibility", ["private", "public"]).notNull().default("private"),
    minRepetitions: tinyint("min_repetitions").notNull().default(5),
    isMock: isMock(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("projects_user_idx").on(t.userId)],
);

export const noveltyChecks = mysqlTable(
  "novelty_checks",
  {
    id: id(),
    dossierId: fk("dossier_id").references(() => dossiers.id, { onDelete: "cascade" }),
    projectId: fk("project_id").references(() => projects.id, { onDelete: "cascade" }),
    userId: userFk(),
    queriesJson: json("queries_json").notNull(),
    resultsJson: json("results_json").notNull(),
    resultLabel: mysqlEnum("result_label", ["no prior work found in these searches", "related work found"]).notNull(),
    ranAt: createdAt(),
  },
  (t) => [index("novelty_dossier_idx").on(t.dossierId), index("novelty_project_idx").on(t.projectId)],
);

export const runConfigs = mysqlTable(
  "run_configs",
  {
    id: id(),
    projectId: fk("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 200 }).notNull(),
    configJson: json("config_json").notNull(),
    configHash: char("config_hash", { length: 64 }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("run_configs_project_idx").on(t.projectId), uniqueIndex("run_configs_project_hash_uq").on(t.projectId, t.configHash)],
);

export const runs = mysqlTable(
  "runs",
  {
    id: id(),
    projectId: fk("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    configId: fk("config_id").notNull().references(() => runConfigs.id, { onDelete: "cascade" }),
    isBaseline: boolean("is_baseline").notNull().default(false),
    envJson: json("env_json").notNull(),
    envFingerprint: char("env_fingerprint", { length: 64 }).notNull(),
    status: mysqlEnum("status", ["ok", "failed", "invalid"]).notNull(),
    failureNote: text("failure_note"),
    isWarmup: boolean("is_warmup").notNull().default(false),
    source: mysqlEnum("source", ["runner", "upload", "notebook"]).notNull(),
    runnerTokenId: fk("runner_token_id").references(() => runnerTokens.id, { onDelete: "set null" }),
    uploadSha256: char("upload_sha256", { length: 64 }),
    command: varchar("command", { length: 2000 }),
    startedAt: dt("started_at"),
    endedAt: dt("ended_at"),
    isMock: isMock(),
    createdAt: createdAt(),
  },
  (t) => [index("runs_project_idx").on(t.projectId), index("runs_project_config_env_idx").on(t.projectId, t.configId, t.envFingerprint)],
);

export const runMetrics = mysqlTable(
  "run_metrics",
  {
    runId: fk("run_id").notNull().references(() => runs.id, { onDelete: "cascade" }),
    metric: varchar("metric", { length: 64 }).notNull(),
    unit: varchar("unit", { length: 16 }).notNull(),
    summaryJson: json("summary_json"),
    clientSummaryJson: json("client_summary_json"),
    n: int("n"),
    rawUri: varchar("raw_uri", { length: 500 }),
  },
  (t) => [primaryKey({ columns: [t.runId, t.metric] })],
);

export const runSamples = mysqlTable(
  "run_samples",
  {
    runId: fk("run_id").notNull().references(() => runs.id, { onDelete: "cascade" }),
    metric: varchar("metric", { length: 64 }).notNull(),
    seq: int("seq").notNull(),
    value: double("value").notNull(),
    tMs: bigint("t_ms", { mode: "number" }),
  },
  (t) => [primaryKey({ columns: [t.runId, t.metric, t.seq] })],
);

export const runGpuTimeline = mysqlTable(
  "run_gpu_timeline",
  {
    runId: fk("run_id").notNull().references(() => runs.id, { onDelete: "cascade" }),
    seq: int("seq").notNull(),
    tMs: bigint("t_ms", { mode: "number" }).notNull(),
    utilPct: double("util_pct"),
    memMb: double("mem_mb"),
    powerW: double("power_w"),
  },
  (t) => [primaryKey({ columns: [t.runId, t.seq] })],
);

/** Generated experiment reports (Markdown + HTML only, D-20). Rendered by worker-py from stored runs (§9 #23). */
export const projectReports = mysqlTable(
  "project_reports",
  {
    id: id(),
    projectId: fk("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    userId: userFk(),
    jobId: char("job_id", { length: 36 }).notNull(),
    status: mysqlEnum("status", ["queued", "done", "failed"]).notNull().default("queued"),
    markdown: mediumtext("markdown"),
    html: mediumtext("html"),
    runIds: json("run_ids").$type<number[]>().notNull(),
    error: text("error"),
    createdAt: createdAt(),
    finishedAt: dt("finished_at"),
  },
  (t) => [index("project_reports_project_idx").on(t.projectId), uniqueIndex("project_reports_job_uq").on(t.jobId)],
);
