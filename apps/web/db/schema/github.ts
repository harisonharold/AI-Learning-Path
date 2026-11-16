import { bigint, boolean, datetime, index, int, json, mysqlEnum, mysqlTable, primaryKey, tinyint, uniqueIndex, varbinary, varchar } from "drizzle-orm/mysql-core";
import { user } from "./auth.ts";
import { createdAt, dt, id, isMock, updatedAt, userIdCol } from "./_helpers.ts";

const userFk = () => userIdCol().notNull().references(() => user.id, { onDelete: "cascade" });

export const ghInstallations = mysqlTable(
  "gh_installations",
  {
    id: bigint("id", { mode: "number", unsigned: true }).primaryKey(),
    userId: userFk(),
    tokenEnc: varbinary("token_enc", { length: 2048 }),
    tokenExpiresAt: dt("token_expires_at"),
    refreshEnc: varbinary("refresh_enc", { length: 2048 }),
    refreshExpiresAt: dt("refresh_expires_at"),
    keyId: tinyint("key_id"),
    permissionsJson: json("permissions_json"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("gh_installations_user_idx").on(t.userId)],
);

export const ghRepos = mysqlTable("gh_repos", {
  fullName: varchar("full_name", { length: 200 }).primaryKey(),
  licence: varchar("licence", { length: 100 }),
  licenceClass: mysqlEnum("licence_class", ["osi", "source_available", "none", "unknown"]).notNull().default("unknown"),
  pushedAt: datetime("pushed_at"),
  stars: int("stars"),
  archived: boolean("archived").notNull().default(false),
  openIssues: int("open_issues"),
  contributingUrl: varchar("contributing_url", { length: 500 }),
  claNote: varchar("cla_note", { length: 200 }),
  syncedAt: dt("synced_at"),
  etag: varchar("etag", { length: 200 }),
});

export const ghIssues = mysqlTable(
  "gh_issues",
  {
    repo: varchar("repo", { length: 200 }).notNull().references(() => ghRepos.fullName, { onDelete: "cascade" }),
    number: int("number").notNull(),
    title: varchar("title", { length: 500 }).notNull(),
    state: varchar("state", { length: 16 }).notNull(),
    labelsJson: json("labels_json"),
    createdAt: datetime("created_at"),
    updatedAt: datetime("updated_at"),
    comments: int("comments"),
    linkedPrsJson: json("linked_prs_json"),
    difficultyEst: tinyint("difficulty_est"),
    difficultyReasons: json("difficulty_reasons"),
    maintainerActivityAt: datetime("maintainer_activity_at"),
    syncedAt: dt("synced_at"),
    etag: varchar("etag", { length: 200 }),
  },
  (t) => [primaryKey({ columns: [t.repo, t.number] }), index("gh_issues_repo_state_idx").on(t.repo, t.state)],
);

export const contributions = mysqlTable(
  "contributions",
  {
    id: id(),
    userId: userFk(),
    repo: varchar("repo", { length: 200 }).notNull(),
    issueNumber: int("issue_number"),
    prNumber: int("pr_number"),
    state: mysqlEnum("state", ["preparing", "pr_opened_by_user", "in_review", "merged", "closed"]).notNull().default("preparing"),
    checklistJson: json("checklist_json"),
    reviewsCount: int("reviews_count").notNull().default(0),
    firstReviewAt: dt("first_review_at"),
    mergedAt: dt("merged_at"),
    verifiedAt: dt("verified_at"),
    prAuthorLogin: varchar("pr_author_login", { length: 39 }),
    isMock: isMock(),
    createdAt: createdAt(),
  },
  (t) => [index("contributions_user_idx").on(t.userId), uniqueIndex("contributions_user_repo_pr_uq").on(t.userId, t.repo, t.prNumber)],
);

