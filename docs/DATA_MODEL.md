# DATA_MODEL.md — Systems Atlas

Status: **Revision 2 — approved with changes 2026-11-16** (practice checks, allowlist, HMAC nonce, SSRF fields). Baseline: G §3 (authoritative) and D.3 (DDL sketch). Every deviation is tagged **[Δ]** and listed with its reason in §9. The Drizzle schema in `apps/web/db/schema/*.ts` will be the single source of truth; this file is its design doc.

## 1. Conventions

- MySQL 8.4 LTS, InnoDB, `utf8mb4` / `utf8mb4_0900_ai_ci`, strict SQL mode.
- Timestamps: `DATETIME(3)` in **UTC**; every table has `created_at` and, where mutable, `updated_at` (Drizzle `$onUpdate`). Local "day" boundaries come from `user_settings.timezone`.
- IDs: app tables use `BIGINT UNSIGNED AUTO_INCREMENT` unless noted; Better Auth `user.id` is `VARCHAR(36)`; content-defined ids (skills, weeks, gates, exercises) are stable slugs `VARCHAR(64)` from `content/*.yaml`.
- `user_id` FKs → `user.id ON DELETE CASCADE` (account delete = full delete, G §8). Global/shared tables (sources, dossiers, gh_repos, gh_issues, price_table) have no `user_id`.
- JSON columns are validated by Zod before write; their shapes are defined in `packages/contracts` or `modules/*/internal/schemas.ts`.
- `is_mock BOOLEAN NOT NULL DEFAULT FALSE` on every user-data table that seed/sample data can populate **[Δ]**. All meter, portfolio and report queries go through repository functions that add `is_mock = FALSE` (AT-20); a lint rule forbids raw selects on those tables outside the repo layer.
- Enums are MySQL `ENUM`s mirrored by TS union types.

## 2. Auth and platform

| Table | Columns (key ones) | Keys / indexes | Notes |
|---|---|---|---|
| `user`, `session`, `account`, `verification` | Better Auth standard | Better Auth defaults; UNIQUE(`account.providerId`, `account.accountId`) | Owned by `modules/auth` (PLAN D-13). Hand-written in Drizzle to mirror better-auth 1.7.25 (PLAN D-36). `account.accessToken/refreshToken` encrypted with `encryptOAuthTokens` **[Δ]** (PLAN D-25). Rows are created **only** for the GitHub numeric id in `ALLOWED_GITHUB_USER_ID` (D-08): the create hook rejects before insert, so a rejected sign-up leaves no row. Session cookie is host-only (no `Domain`) so `SANDBOX_ORIGIN` never receives it (D-14) |
| `profiles` **[Δ]** | `user_id PK FK`, `handle VARCHAR(39) UNIQUE`, `display_name`, `bio` | UNIQUE(handle) | Needed by `/p/:handle` |
| `user_roles` **[Δ]** | `user_id FK`, `role ENUM('learner','reviewer','admin')` | PK(user_id, role) | C.2 roles; admin is a separate flag on the same person |
| `user_settings` **[Δ]** | `user_id PK FK`, `mode ENUM('ACC','RI')`, `hours_per_week TINYINT` (20/30/40/50), `timezone VARCHAR(64) DEFAULT 'America/Toronto'`, `theme`, `sample_data BOOLEAN DEFAULT FALSE`, `ai_provider ENUM('none','anthropic') DEFAULT 'none'`, `ai_model VARCHAR(80)`, `a11y_pause_timers BOOLEAN` | PK | G §4 `GET/PUT /api/settings` had no table |
| `ai_credentials` **[Δ]** | `id`, `user_id FK`, `provider`, `key_enc VARBINARY(1024)`, `key_id TINYINT` (encryption key version), `key_last4 CHAR(4)`, `created_at`, `revoked_at` | UNIQUE(user_id, provider) | Write-only key (AT-37). `key_enc` = `nonce(12) ‖ ciphertext ‖ tag(16)`, AAD = `user_id ‖ provider` |
| `runner_tokens` | `id`, `user_id FK`, `token_prefix CHAR(8)` **[Δ]**, `token_hash CHAR(64)`, `scopes JSON`, `expires_at`, `revoked BOOLEAN`, `last_used_at` **[Δ]**, `created_at` | UNIQUE(token_hash), INDEX(user_id) | 32 random bytes, SHA-256 stored; prefix for display only. Max lifetime 90 days |
| `jobs` | `id CHAR(36) PK`, `user_id FK NULL` **[Δ]**, `kind`, `status ENUM('queued','running','done','failed')`, `attempts TINYINT` **[Δ]**, `payload_json`, `result_json`, `error TEXT`, `created_at`, `finished_at` | INDEX(user_id, created_at), INDEX(status) | user_id for authz on `/api/jobs` |
| `audit_log` | `id`, `user_id FK NULL`, `action VARCHAR(100)`, `target`, `meta_json`, `ip_hash CHAR(64)` **[Δ]**, `created_at` | INDEX(user_id, created_at) | publish/token/settings/export/delete/sign-in. `ON DELETE SET NULL` so the delete event itself survives |

## 3. Curriculum and learning

| Table | Columns | Keys / indexes | Notes |
|---|---|---|---|
| `skills` | `id VARCHAR(64) PK`, `name`, `area` | | from content |
| `skill_edges` | `from_skill FK`, `to_skill FK` | PK(from,to), INDEX(to_skill) | DAG; seed loader rejects cycles |
| `weeks` | `id VARCHAR(32) PK` (e.g. `RI-W05`, `ACC-03`), `mode`, `ordinal`, `title`, `hardware ENUM('CPU','GPU_FREE','GPU_RENT')`, `content_version`, `ri_week_ids JSON` **[Δ]**, `no_ai_code BOOLEAN` **[Δ]**, `publish_restricted BOOLEAN` **[Δ]**, `restriction_note` **[Δ]** | UNIQUE(mode, ordinal) | `ri_week_ids` maps ACC merges (G §7); `no_ai_code` drives the mentor filter (Q8); `publish_restricted` for course-policy labs (X-09) |
| `gates` | `id VARCHAR(64) PK`, `week_id FK`, `kind ENUM('tests','exam','report','defense')`, `rubric_json`, `required_evidence JSON`, `skill_ids JSON`, `objective_spec JSON` **[Δ]**, `content_version` | INDEX(week_id) | `required_evidence` = list of `{kind: tests|commit_sha|report|recording|runner_result, label}` |
| `gate_skills` **[Δ]** | `gate_id FK`, `skill_id FK` | PK | Normalised copy of `skill_ids` so lock queries can join (JSON arrays can't be FK'd) |
| `exercises` **[Δ]** | `id VARCHAR(64) PK`, `gate_id FK NULL`, `week_id FK`, `language ENUM('python','c','go','cpp','cuda')`, `practice_runtime ENUM('pyodide','none')`, `public_tests_uri` (served on `SANDBOX_ORIGIN` for practice checks), `gate_tests_ref` (versioned test bundle id fetched by atlas-lab with a runner token; never shipped to the browser), `solution_uri` (server-only path) | INDEX(week_id) | Page 6 catalogue. Public tests = practice only (D-15). `solution_uri` never served before gate pass (X-06) |
| `user_skill_state` | `user_id FK`, `skill_id FK`, `level ENUM('not_started','developing','competent','verified')`, `updated_at` | PK(user_id, skill_id) | derived cache; recomputed from attempts |
| `attempts` | `id`, `user_id FK`, `gate_id FK`, `exercise_id FK NULL` **[Δ]**, `source ENUM('browser','runner','server','manual','diagnostic')` **[Δ adds server, diagnostic]**, `status ENUM('practice','pending_evidence','passed','failed')` **[Δ]**, `passed BOOLEAN` (kept; for practice rows it records the practice-check outcome only), `score DECIMAL(5,2)`, `result_json`, `evidence_url`, `commit_sha CHAR(40)`, `content_version` **[Δ]**, `hints_used TINYINT` **[Δ]**, `is_mock`, `created_at` | INDEX(user_id, gate_id, created_at); **CHECK (`source <> 'browser'` OR `status = 'practice'`)** and **CHECK (`status <> 'practice'` OR `source = 'browser'`)** **[Δ]** | AT-07 "pending evidence"; E.3 §6 hints. Browser results are "practice checks" (D-15): the DB itself refuses a browser row in any counting state, and `gateState()` filters `status <> 'practice'` (X-13). MySQL 8.4 enforces CHECK constraints |
| `attempt_evidence` **[Δ]** | `id`, `attempt_id FK`, `passed BOOLEAN NULL`, `ref VARCHAR(200)`, `quiz_id VARCHAR(64)` (P1, §9 #22), `kind ENUM('runner_result','server_graded','github_commit','github_ci','reviewer_score','self_rubric','report','recording')`, `counts BOOLEAN` (generated: TRUE for `runner_result`, `server_graded`, `github_commit`, `github_ci`, `reviewer_score`; FALSE for `self_rubric`; `report`/`recording` count only as the artifact a rubric scores), `url`, `commit_sha`, `runner_run_id FK NULL`, `verified BOOLEAN`, `verified_at`, `verify_method` | INDEX(attempt_id) | Multiple evidence items per attempt (AT-07). `github_commit`/`github_ci` verified with GET via the GitHub data module. No evidence kind exists for browser results (D-15) |
| `rubric_scores` | `id`, `attempt_id FK`, `criterion`, `level ENUM(missing,partial,competent,strong)`, `scorer ENUM(self,reviewer,auto,ai_suggested)`, `scorer_user_id FK NULL` **[Δ]**, `note`, `created_at` | INDEX(attempt_id) | scorer derived from session role, never from body; `ai_suggested` excluded from pass logic (X-11) |
| `remediation_plans` **[Δ]** | `id`, `user_id FK`, `gate_id FK`, `failed_attempt_id FK`, `track_json`, `status ENUM('open','done')`, `reattempt_after DATETIME NULL`, `created_at` | INDEX(user_id, status) | FR-8 / AT-11 had no table; B.6 "after 48 h" rule |
| `diagnostic_sessions` **[Δ]** | `id`, `user_id FK`, `state_json` (autosave), `paused_ms`, `started_at`, `completed_at`, `result_json` | INDEX(user_id) | E.3 §2 autosave + pause |
| `cards` | `id`, `user_id FK`, `skill_id FK`, `week_id FK` **[Δ]**, `origin ENUM('seed','lesson','user')` **[Δ]**, `front`, `back`, `fsrs_state JSON`, `due_at`, `suspended BOOLEAN` **[Δ]** | INDEX(user_id, due_at) | `week_id` for "earlier weeks only" (AT-09) |
| `card_reviews` **[Δ]** | `id`, `card_id FK`, `user_id FK`, `rating TINYINT`, `state_before JSON`, `reviewed_at`, `elapsed_days`, `scheduled_days` | INDEX(user_id, reviewed_at) | FSRS review log; needed for the retention curve (E.3 §16) |
| `time_logs` | `id`, `user_id FK`, `week_id FK`, `minutes`, `category`, `logged_on DATE`, `source ENUM('timer','manual')` **[Δ]** | INDEX(user_id, logged_on) | **Never read by lock logic** — AT-06 also asserts the lock function's signature takes no time data |

## 4. Sources and research

| Table | Columns | Keys / indexes | Notes |
|---|---|---|---|
| `sources` | `id`, `kind ENUM(paper,repo,course,doc,price,issue,job,blog)`, `fetch_block_reason VARCHAR(64) NULL` **[Δ]** (e.g. `private_address`, `port_not_allowed`, `redirect_limit`, `size_cap`, `timeout`, set by `safeFetch`; D-17), `url VARCHAR(2048)` **[Δ length]**, `url_hash CHAR(64)` **[Δ]**, `final_url` **[Δ]**, `title`, `venue`, `year`, `external_id`, `licence`, `last_activity_at`, `verification ENUM(verified,partial,unverified,broken)`, `verified_at DATETIME NULL` **[Δ nullable]**, `last_checked_at DATETIME NOT NULL` **[Δ]**, `verify_method`, `verify_note` **[Δ]**, `raw_json`, `seed_verified_at` **[Δ]** | UNIQUE(url_hash), INDEX(kind), INDEX(verified_at), UNIQUE(kind, external_id) | `verified_at` = last *successful* verification; staleness = `now − verified_at > 30 d` or NULL. A failed re-check updates `last_checked_at` and may downgrade `verification`, but never refreshes `verified_at` |
| `papers` | `id`, `user_id FK` **[Δ]**, `source_id FK`, `title` **[Δ denormalised]**, `abstract TEXT`, `authors_json`, `user_notes MEDIUMTEXT`, `analysis_json`, `status ENUM('to_read','read','analysed')` **[Δ]**, `is_mock` | UNIQUE(user_id, source_id), FULLTEXT(title, abstract, user_notes) | Notes are per user (AT-04); title copied for FULLTEXT (can't span tables) |
| `dossiers` | `id`, `slug UNIQUE`, `title`, `classification ENUM(...)`, `fields_json` (20 fields), `difficulty TINYINT`, `feasibility TINYINT`, `hardware ENUM(CPU,GPU_FREE,GPU_RENT,MULTI_GPU)`, `override_note TEXT NULL` **[Δ]**, `security_sensitive BOOLEAN` **[Δ]**, `reviewed_at` | UNIQUE(slug), INDEX(classification) | CHECK difficulty/feasibility 1–5. `override_note` = AT-24 escape hatch; `security_sensitive` (F.4-3) makes the mentor refuse exploit content |
| `dossier_evidence` | `dossier_id FK`, `source_id FK`, `claim TEXT`, `evidence_date DATE`, `is_primary BOOLEAN` **[Δ]** | PK(dossier_id, source_id) | `is_primary` for the "documented open problem" rule |
| `novelty_checks` | `id`, `dossier_id FK NULL`, `project_id FK NULL` **[Δ]**, `user_id FK` **[Δ]**, `queries_json`, `results_json`, `result_label` fixed text "no prior work found in these searches" or "related work found" **[Δ]**, `ran_at` | INDEX(dossier_id), INDEX(project_id) | user hypotheses live on projects, not seed dossiers |
| `projects` | `id`, `user_id FK`, `dossier_id FK NULL`, `title`, `hypothesis`, `plan_md`, `prereg_json` **[Δ]** `{primary_metric, baseline_desc, stopping_rule, min_repetitions}`, `preregistered_at`, `status ENUM(draft,running,concluded,abandoned)`, `visibility ENUM(private,public) DEFAULT private`, `min_repetitions TINYINT DEFAULT 5` **[Δ]**, `is_mock` | INDEX(user_id) | `prereg_json` immutable once `preregistered_at` is set (amendments appended to `plan_md` with timestamps) |
| `run_configs` | `id`, `project_id FK`, `name`, `config_json`, `config_hash CHAR(64)` | INDEX(project_id), UNIQUE(project_id, config_hash) | |
| `runs` | `id`, `project_id FK`, `config_id FK`, `is_baseline`, `env_json`, `env_fingerprint CHAR(64)` **[Δ]**, `status ENUM(ok,failed,invalid)`, `failure_note`, `is_warmup BOOLEAN` **[Δ]**, `source ENUM('runner','upload','notebook')` **[Δ]**, `runner_token_id FK NULL` **[Δ]**, `upload_sha256 CHAR(64)` **[Δ]**, `started_at`, `ended_at`, `is_mock` | INDEX(project_id), INDEX(project_id, config_id, env_fingerprint) | `env_fingerprint` = hash of hardware/driver/CUDA/libs, used for "same-environment baseline" (F.5). Failed runs are never deleted by any code path except project/account delete |
| `run_metrics` | `run_id FK`, `metric`, `unit`, `summary_json` (server-computed), `client_summary_json` **[Δ]**, `n INT`, `raw_uri` | PK(run_id, metric) | Client summary kept only for audit/diff, never displayed as truth (AT-15) |
| `run_samples` | `run_id FK`, `metric`, `seq INT`, `value DOUBLE`, `t_ms BIGINT` | PK(run_id, metric, seq) | **Cap: 100 000 samples per (run, metric)**; overflow written to `raw-data` volume as gzip JSON, `raw_uri` set, server summary computed from the full set before truncation |
| `run_gpu_timeline` **[Δ]** | `run_id FK`, `seq`, `t_ms`, `util_pct`, `mem_mb`, `power_w NULL` | PK(run_id, seq) | Upload contract has `gpu_timeline`; G §3 has nowhere to store it. Cap 50 000 points |
| `project_reports` **[Δ, P2]** | `id`, `project_id FK`, `user_id FK`, `job_id CHAR(36)`, `status`, `markdown MEDIUMTEXT`, `html MEDIUMTEXT`, `run_ids JSON`, `error`, `created_at`, `finished_at` | INDEX(project_id), UNIQUE(job_id) | Markdown + HTML only (D-20); HTML built from escaped text by worker-py; downloaded as an attachment (§9 #23) |

## 5. GitHub

| Table | Columns | Keys / indexes | Notes |
|---|---|---|---|
| `gh_installations` | `id BIGINT PK` (GitHub installation id), `user_id FK`, `token_enc`, `token_expires_at`, `refresh_enc`, `refresh_expires_at` **[Δ]**, `key_id TINYINT` **[Δ]**, `permissions_json` **[Δ]** | INDEX(user_id) | `permissions_json` as returned by GitHub, asserted read-only on every refresh (alert + disable if any `write`) |
| `gh_repos` | `full_name PK`, `licence`, `licence_class ENUM('osi','source_available','none','unknown')` **[Δ]**, `pushed_at`, `stars`, `archived`, `open_issues INT` **[Δ]**, `contributing_url`, `cla_note`, `synced_at`, `etag` | | FR-18 open-issue counts; source-available label (G §6.5). Also linked to a `sources` row for verified_at |
| `gh_issues` | `repo FK`, `number`, `title`, `state`, `labels_json`, `created_at`, `updated_at`, `comments`, `linked_prs_json`, `difficulty_est TINYINT`, `difficulty_reasons JSON`, `maintainer_activity_at` **[Δ]**, `synced_at`, `etag` **[Δ]** | PK(repo, number), INDEX(repo, state) | Text stored as received, rendered escaped (X-12). Beginner-friendly needs maintainer activity ≤ 90 d |
| `contributions` | `id`, `user_id FK`, `repo`, `issue_number NULL`, `pr_number NULL`, `state ENUM(preparing,pr_opened_by_user,in_review,merged,closed)`, `checklist_json`, `reviews_count`, `first_review_at`, `merged_at`, `verified_at` **[Δ]**, `pr_author_login` **[Δ]**, `is_mock` | INDEX(user_id), UNIQUE(user_id, repo, pr_number) | Merged → evidence only if `pr_author_login` = user's GitHub login and `merged_at` came from the API (AT-31) |

## 6. Mentor, interviews, portfolio

| Table | Columns | Keys / indexes | Notes |
|---|---|---|---|
| `mentor_threads` **[Δ]** | `id CHAR(36) PK`, `user_id FK`, `mode`, `context_kind`, `context_id` (gate/exercise/project), `created_at` | INDEX(user_id) | G §3 uses `thread_id` with no parent |
| `mentor_messages` | `id`, `user_id FK`, `thread_id FK`, `role ENUM(user,assistant)`, `mode`, `content MEDIUMTEXT`, `cited_source_ids JSON`, `confidence ENUM(high,medium,low) NULL`, `policy_flags JSON` **[Δ]** (`withheld`, `code_truncated`, `uncited`), `provider`, `model`, `input_tokens`, `output_tokens`, `cost_usd DECIMAL(10,5)`, `created_at` | INDEX(thread_id, created_at) | Cited ids filtered to ids that exist in `sources` at write time |
| `ai_budgets` | `user_id PK`, `daily_usd`, `monthly_usd`, `per_request_max_output_tokens INT` **[Δ]**, `spent_today`, `spent_month`, `period_day DATE` **[Δ]**, `period_month CHAR(7)` **[Δ]** | | Cached totals; truth is the ledger |
| `ai_spend_ledger` **[Δ]** | `id`, `user_id FK`, `message_id FK NULL`, `kind ENUM('reservation','settlement','release')`, `usd DECIMAL(10,5)`, `created_at` | INDEX(user_id, created_at) | Reserve worst-case cost in a transaction (`SELECT … FOR UPDATE` on `ai_budgets`) before calling the provider; settle with actual usage (X-08, AT-36) |
| `price_table` | `provider`, `model`, `input_per_mtok`, `output_per_mtok`, `max_prompt_tokens_for_rate INT NULL` **[Δ]**, `source_id FK` **[Δ]**, `source_url`, `verified_at` | PK(provider, model) | Haiku 5.5 rate applies to prompts ≤ 100k tokens (SOURCES §6) |
| `weaknesses` | `id`, `user_id FK`, `skill_id FK`, `observation`, `evidence_ref`, `origin ENUM('mentor','gate')` **[Δ]**, `created_at` | INDEX(user_id) | hard-deleted on learner request |
| `interview_sessions` **[Δ]** | `id`, `user_id FK`, `kind ENUM('coding','system_design','defend','behavioural')`, `started_at`, `ended_at`, `transcript_md`, `recording_ref` (local file name + sha256 only; file stays in browser), `attempt_id FK NULL` | INDEX(user_id) | AT-38; rubric scores reuse `rubric_scores` via `attempt_id` |
| `portfolio_items` | `id`, `user_id FK`, `kind`, `ref_id BIGINT`, `slug`, `published BOOLEAN DEFAULT FALSE`, `checks_json`, `published_at`, `evidence_verified_at` **[Δ]** | UNIQUE(user_id, slug) | CHECK at service layer: publish only if source artifact verified, not mock, not `publish_restricted` |
| `writing_drafts` **[Δ]** | `id`, `user_id FK`, `kind ENUM('linkedin','resume_bullet','blog')`, `sentences_json` `[{text, evidence:[{kind,id}]}]`, `created_at` | INDEX(user_id) | AT-41: rejected sentences are never stored |

## 7a. State kept in Redis, not MySQL **[Δ]**

| Key | Value | TTL | Purpose |
|---|---|---|---|
| `hmac:nonce:<nonce>` | `1` (set with `NX`) | 600 s | Replay protection for internal calls (D-16). A failed `SET NX` = reused nonce ⇒ 401; Redis unreachable ⇒ fail closed (503) |
| `rl:<route>:<user|ip>` | token bucket | per bucket | Rate limits (G §8) |
| BullMQ keys | queue state | BullMQ-managed | Jobs; the durable record is `jobs` in MySQL |

Redis holds no secrets and no record whose loss changes evidence; losing it only drops in-flight jobs (re-queued from `jobs`) and nonces (callbacks older than 5 minutes are already rejected by timestamp).

## 7. MySQL configuration that the model depends on

- `innodb_ft_min_token_size = 2` (default 3 would make "KV", "TP", "DP" unsearchable) and a custom empty-ish stopword table; requires the FULLTEXT index to be built after the setting (fresh volume). Test: search "KV" returns the CacheGen paper.
- `sql_mode` strict; `time_zone='+00:00'`; `max_allowed_packet ≥ 32M` (20 MB uploads land in samples in batches, not one packet).
- Least-privilege DB users: `atlas_app` (DML on app schema), `atlas_migrate` (DDL, used only by the migration step), `atlas_backup` (SELECT, LOCK TABLES, SHOW VIEW, EVENT, TRIGGER).

## 8. Retention and caps

| Data | Cap / retention |
|---|---|
| `run_samples` | 100k per run-metric in DB; rest in files |
| `run_gpu_timeline` | 50k points per run (server downsamples by max-preserving bucketing) |
| Upload body | 20 MB (G §4), enforced while streaming |
| `jobs` | `done` purged after 30 days, `failed` after 90 days (nightly) |
| `session` | Better Auth expiry 7 days, rolling; revoke all on account delete |
| `audit_log` | 1 year, then purged; export/delete/publish/token events kept until account delete |
| `mentor_messages` | kept until the learner deletes a thread or the account |
| `ai_spend_ledger` | 13 months |
| `card_reviews` | forever (needed for FSRS optimisation) |
| `gh_issues` | refreshed ≤ daily; closed issues not linked to a contribution purged after 90 days |
| `sources` | never deleted automatically; `broken` stays visible as broken |
| Raw files (`raw-data` volume) | deleted with run/project/account |
| Backups | restic retention 7 daily / 4 weekly / 6 monthly (cost of bucket UNVERIFIED, D.6) |

## 9. Changes vs G §3 and why

| # | Change | Reason |
|---|---|---|
| 1 | Added `profiles`, `user_roles`, `user_settings`, `ai_credentials` | G §4 settings/AI-key/public-handle endpoints and C.2 roles have no storage in G §3 |
| 2 | `attempts.status` (+ keep `passed`), `attempt_evidence` table | AT-07 "pending evidence" and multiple evidence items cannot be modelled by one boolean and one URL |
| 3 | `remediation_plans`, `diagnostic_sessions`, `card_reviews`, `exercises`, `gate_skills` | FR-8, E.3 §2 autosave, FSRS retention curve, page 6 catalogue, and joinable lock queries |
| 4 | `weeks.ri_week_ids`, `no_ai_code`, `publish_restricted` | ACC mapping, AI-code rule per week, course publishing policies |
| 5 | `sources.url_hash` unique instead of `UNIQUE(url(255))`; `verified_at` nullable + `last_checked_at` | Prefix uniqueness rejects distinct long URLs; a manual `unverified` source has no honest verified_at; failed re-checks must not refresh it |
| 6 | `papers.user_id`, `papers.title`, `papers.status` | Notes are per-user (cross-user test), FULLTEXT can't span tables, E.3 §10 "my status" |
| 7 | `dossiers.override_note`, `security_sensitive`; `dossier_evidence.is_primary`; `novelty_checks.project_id/user_id/result_label` | AT-24 override, F.4-3 safety, F.3 primary-source rule, user hypotheses, fixed non-"novel" wording |
| 8 | `projects.prereg_json`, `min_repetitions` | F.5 pre-registration fields (metric, baseline, stopping rule) and the configurable repetition rule (AT-19) |
| 9 | `runs.env_fingerprint`, `is_warmup`, `source`, `runner_token_id`, `upload_sha256`; `run_metrics.client_summary_json`, `n`; `run_gpu_timeline` | Same-env baseline rule, warm-up exclusion, provenance, AT-15 audit, the contract's `gpu_timeline` |
| 10 | `gh_installations.refresh_expires_at/key_id/permissions_json`; `gh_repos.licence_class/open_issues`; `gh_issues.etag/maintainer_activity_at`; `contributions.verified_at/pr_author_login` | Token lifecycle, read-only assertion, FR-18, ETag per issue, 90-day rule, AT-31 proof of authorship |
| 11 | `mentor_threads`, `mentor_messages.policy_flags`, `ai_spend_ledger`, budget period columns, `price_table.source_id/max_prompt_tokens_for_rate` | Thread parent, AT-33/34/35 flags, race-free caps (AT-36), tiered prices |
| 12 | `interview_sessions`, `writing_drafts`, `portfolio_items.evidence_verified_at` | AT-38, AT-41, AT-39 |
| 13 | `jobs.user_id`, `jobs.attempts`; `audit_log.ip_hash` | Authz on job listing, retry count (D.7 max 5), forensic trace without storing raw IPs |
| 14 | `is_mock` on attempts, projects, runs, papers, contributions | G §0.5 says "records carry is_mock"; G §3 only had it on runs |
| 15 | Better Auth `account` tokens encrypted at rest — implemented with Better Auth's `encryptOAuthTokens` (XChaCha20-Poly1305), see PLAN D-25 | G §0.8/FR-17 "tokens encrypted at rest"; Better Auth stores them plaintext by default |
| 16 | `attempts.status` gains `practice`; `attempts.source` gains `server`; two CHECK constraints tie `browser` ⇔ `practice` | Approved fix: browser tests can't be hidden, so they are practice checks and must be impossible to count (D-15, X-13) |
| 17 | `attempt_evidence.kind` enum + generated `counts` column | Makes "counting evidence = server-side or atlas-lab only" a data rule, not just service logic |
| 18 | `exercises.practice_runtime`, `gate_tests_ref` replace a single `runtime` | Public practice tests (sandbox origin) are separated from gate test bundles (atlas-lab only) |
| 19 | `sources.fetch_block_reason` | SSRF guard outcomes are recorded so a blocked URL shows *why* it is `broken` (D-17, X-04) |
| 20 | Redis nonce keys (§7a) | Approved fix: HMAC replay protection (D-16, X-10) |
| 22 | `attempt_evidence.passed`, `ref`, `quiz_id` (migration 0002, P1) | The outcome of objective evidence and which requirement it answers (runner ref or quiz) are real columns, not encoded in `verify_method` (PLAN D-43) |
| 21 | Auth rows only for the allowlisted GitHub id | Approved fix: single-account sign-up (D-08, X-01). AT-04's second user is inserted by test fixtures directly, never through sign-up |
| 23 | `project_reports` table (`id`, `project_id FK`, `user_id FK`, `job_id` unique, `status ENUM(queued,done,failed)`, `markdown`, `html`, `run_ids JSON`, `error`, `created_at`, `finished_at`) and `runs.command VARCHAR(2000)` (migration 0003, P2) | Reports need storage with their exact run set; F.6 asks for the exact command. `run_metrics.summary_json` holds the server summary (n, mean, stdev, min, max, p25/p50/p75/p95/p99) plus, once worker-py has run, `ci95`, `ci_method`, `resamples`, `seed`, `basis_n`, `histogram`, `cdf` and `ci_status` (PLAN D-56) |

Nothing in G §3 is removed.
