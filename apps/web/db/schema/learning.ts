import { sql } from "drizzle-orm";
import { boolean, char, check, date, decimal, index, int, json, mysqlEnum, mysqlTable, primaryKey, text, tinyint, uniqueIndex, varchar } from "drizzle-orm/mysql-core";
import { user } from "./auth.ts";
import { createdAt, dt, fk, id, isMock, updatedAt, userIdCol } from "./_helpers.ts";

const userFk = () => userIdCol().notNull().references(() => user.id, { onDelete: "cascade" });

export const skills = mysqlTable("skills", {
  id: varchar("id", { length: 64 }).primaryKey(),
  name: varchar("name", { length: 200 }).notNull(),
  area: varchar("area", { length: 64 }).notNull(),
});

export const skillEdges = mysqlTable(
  "skill_edges",
  {
    fromSkill: varchar("from_skill", { length: 64 }).notNull().references(() => skills.id, { onDelete: "cascade" }),
    toSkill: varchar("to_skill", { length: 64 }).notNull().references(() => skills.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.fromSkill, t.toSkill] }), index("skill_edges_to_idx").on(t.toSkill)],
);

export const weeks = mysqlTable(
  "weeks",
  {
    id: varchar("id", { length: 32 }).primaryKey(),
    mode: mysqlEnum("mode", ["ACC", "RI"]).notNull(),
    ordinal: int("ordinal").notNull(),
    title: varchar("title", { length: 200 }).notNull(),
    hardware: mysqlEnum("hardware", ["CPU", "GPU_FREE", "GPU_RENT"]).notNull(),
    contentVersion: varchar("content_version", { length: 40 }).notNull(),
    riWeekIds: json("ri_week_ids").$type<string[]>().notNull(),
    noAiCode: boolean("no_ai_code").notNull().default(false),
    publishRestricted: boolean("publish_restricted").notNull().default(false),
    restrictionNote: text("restriction_note"),
  },
  (t) => [uniqueIndex("weeks_mode_ordinal_uq").on(t.mode, t.ordinal)],
);

export const gates = mysqlTable(
  "gates",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    weekId: varchar("week_id", { length: 32 }).notNull().references(() => weeks.id),
    kind: mysqlEnum("kind", ["tests", "exam", "report", "defense"]).notNull(),
    rubricJson: json("rubric_json"),
    requiredEvidence: json("required_evidence").notNull(),
    skillIds: json("skill_ids").$type<string[]>().notNull(),
    objectiveSpec: json("objective_spec"),
    contentVersion: varchar("content_version", { length: 40 }).notNull(),
  },
  (t) => [index("gates_week_idx").on(t.weekId)],
);

export const gateSkills = mysqlTable(
  "gate_skills",
  {
    gateId: varchar("gate_id", { length: 64 }).notNull().references(() => gates.id, { onDelete: "cascade" }),
    skillId: varchar("skill_id", { length: 64 }).notNull().references(() => skills.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.gateId, t.skillId] })],
);

export const exercises = mysqlTable(
  "exercises",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    gateId: varchar("gate_id", { length: 64 }).references(() => gates.id),
    weekId: varchar("week_id", { length: 32 }).notNull().references(() => weeks.id),
    language: mysqlEnum("language", ["python", "c", "go", "cpp", "cuda"]).notNull(),
    practiceRuntime: mysqlEnum("practice_runtime", ["pyodide", "none"]).notNull(),
    publicTestsUri: varchar("public_tests_uri", { length: 500 }),
    gateTestsRef: varchar("gate_tests_ref", { length: 200 }),
    solutionUri: varchar("solution_uri", { length: 500 }),
  },
  (t) => [index("exercises_week_idx").on(t.weekId)],
);

export const userSkillState = mysqlTable(
  "user_skill_state",
  {
    userId: userFk(),
    skillId: varchar("skill_id", { length: 64 }).notNull().references(() => skills.id, { onDelete: "cascade" }),
    level: mysqlEnum("level", ["not_started", "developing", "competent", "verified"]).notNull().default("not_started"),
    updatedAt: updatedAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.skillId] })],
);

/** Browser results are practice checks: the two CHECK constraints make `browser` <=> `practice` (PLAN D-15). */
export const attempts = mysqlTable(
  "attempts",
  {
    id: id(),
    userId: userFk(),
    gateId: varchar("gate_id", { length: 64 }).notNull().references(() => gates.id),
    exerciseId: varchar("exercise_id", { length: 64 }).references(() => exercises.id),
    source: mysqlEnum("source", ["browser", "runner", "server", "manual", "diagnostic"]).notNull(),
    status: mysqlEnum("status", ["practice", "pending_evidence", "passed", "failed"]).notNull(),
    passed: boolean("passed"),
    score: decimal("score", { precision: 5, scale: 2 }),
    resultJson: json("result_json"),
    evidenceUrl: varchar("evidence_url", { length: 500 }),
    commitSha: char("commit_sha", { length: 40 }),
    contentVersion: varchar("content_version", { length: 40 }).notNull(),
    hintsUsed: tinyint("hints_used").notNull().default(0),
    isMock: isMock(),
    createdAt: createdAt(),
  },
  (t) => [
    index("attempts_user_gate_created_idx").on(t.userId, t.gateId, t.createdAt),
    check("attempts_browser_is_practice", sql`${t.source} <> 'browser' OR ${t.status} = 'practice'`),
    check("attempts_practice_is_browser", sql`${t.status} <> 'practice' OR ${t.source} = 'browser'`),
  ],
);

export const attemptEvidence = mysqlTable(
  "attempt_evidence",
  {
    id: id(),
    attemptId: fk("attempt_id").notNull().references(() => attempts.id, { onDelete: "cascade" }),
    kind: mysqlEnum("kind", ["runner_result", "server_graded", "github_commit", "github_ci", "reviewer_score", "self_rubric", "report", "recording"]).notNull(),
    counts: boolean("counts").generatedAlwaysAs(
      sql`(kind IN ('runner_result','server_graded','github_commit','github_ci','reviewer_score'))`,
      { mode: "stored" },
    ),
    /** Outcome for objective evidence (true/false); null for artifacts (report/recording) and not-yet-run items. */
    passed: boolean("passed"),
    /** Which requirement it answers: runner ref (e.g. atlas-lab:w01@1) or quiz id. */
    ref: varchar("ref", { length: 200 }),
    quizId: varchar("quiz_id", { length: 64 }),
    url: varchar("url", { length: 500 }),
    commitSha: char("commit_sha", { length: 40 }),
    runnerRunId: fk("runner_run_id"),
    verified: boolean("verified").notNull().default(false),
    verifiedAt: dt("verified_at"),
    verifyMethod: varchar("verify_method", { length: 100 }),
    createdAt: createdAt(),
  },
  (t) => [index("attempt_evidence_attempt_idx").on(t.attemptId)],
);

export const rubricScores = mysqlTable(
  "rubric_scores",
  {
    id: id(),
    attemptId: fk("attempt_id").notNull().references(() => attempts.id, { onDelete: "cascade" }),
    criterion: varchar("criterion", { length: 100 }).notNull(),
    level: mysqlEnum("level", ["missing", "partial", "competent", "strong"]).notNull(),
    scorer: mysqlEnum("scorer", ["self", "reviewer", "auto", "ai_suggested"]).notNull(),
    scorerUserId: userIdCol("scorer_user_id").references(() => user.id, { onDelete: "set null" }),
    note: text("note"),
    createdAt: createdAt(),
  },
  (t) => [index("rubric_scores_attempt_idx").on(t.attemptId)],
);

export const remediationPlans = mysqlTable(
  "remediation_plans",
  {
    id: id(),
    userId: userFk(),
    gateId: varchar("gate_id", { length: 64 }).notNull().references(() => gates.id),
    failedAttemptId: fk("failed_attempt_id").notNull().references(() => attempts.id, { onDelete: "cascade" }),
    trackJson: json("track_json").notNull(),
    status: mysqlEnum("status", ["open", "done"]).notNull().default("open"),
    reattemptAfter: dt("reattempt_after"),
    createdAt: createdAt(),
  },
  (t) => [index("remediation_user_status_idx").on(t.userId, t.status)],
);

export const diagnosticSessions = mysqlTable(
  "diagnostic_sessions",
  {
    id: id(),
    userId: userFk(),
    stateJson: json("state_json"),
    pausedMs: int("paused_ms").notNull().default(0),
    startedAt: createdAt(),
    completedAt: dt("completed_at"),
    resultJson: json("result_json"),
  },
  (t) => [index("diagnostic_user_idx").on(t.userId)],
);

export const cards = mysqlTable(
  "cards",
  {
    id: id(),
    userId: userFk(),
    skillId: varchar("skill_id", { length: 64 }).notNull().references(() => skills.id),
    weekId: varchar("week_id", { length: 32 }).notNull().references(() => weeks.id),
    origin: mysqlEnum("origin", ["seed", "lesson", "user"]).notNull(),
    front: text("front").notNull(),
    back: text("back").notNull(),
    fsrsState: json("fsrs_state").notNull(),
    dueAt: dt("due_at").notNull(),
    suspended: boolean("suspended").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index("cards_user_due_idx").on(t.userId, t.dueAt)],
);

export const cardReviews = mysqlTable(
  "card_reviews",
  {
    id: id(),
    cardId: fk("card_id").notNull().references(() => cards.id, { onDelete: "cascade" }),
    userId: userFk(),
    rating: tinyint("rating").notNull(),
    stateBefore: json("state_before").notNull(),
    reviewedAt: createdAt(),
    elapsedDays: int("elapsed_days").notNull(),
    scheduledDays: int("scheduled_days").notNull(),
  },
  (t) => [index("card_reviews_user_idx").on(t.userId, t.reviewedAt)],
);

export const timeLogs = mysqlTable(
  "time_logs",
  {
    id: id(),
    userId: userFk(),
    weekId: varchar("week_id", { length: 32 }).notNull().references(() => weeks.id),
    minutes: int("minutes").notNull(),
    category: varchar("category", { length: 32 }).notNull(),
    loggedOn: date("logged_on").notNull(),
    source: mysqlEnum("source", ["timer", "manual"]).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("time_logs_user_day_idx").on(t.userId, t.loggedOn)],
);
