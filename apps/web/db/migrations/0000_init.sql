CREATE TABLE `account` (
	`id` varchar(36) NOT NULL,
	`account_id` varchar(255) NOT NULL,
	`provider_id` varchar(64) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` datetime(3),
	`refresh_token_expires_at` datetime(3),
	`scope` text,
	`password` text,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `account_id` PRIMARY KEY(`id`),
	CONSTRAINT `account_provider_subject_uq` UNIQUE(`provider_id`,`account_id`)
);
--> statement-breakpoint
CREATE TABLE `session` (
	`id` varchar(36) NOT NULL,
	`expires_at` datetime(3) NOT NULL,
	`token` varchar(255) NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`ip_address` varchar(64),
	`user_agent` text,
	`user_id` varchar(36) NOT NULL,
	CONSTRAINT `session_id` PRIMARY KEY(`id`),
	CONSTRAINT `session_token_unique` UNIQUE(`token`)
);
--> statement-breakpoint
CREATE TABLE `user` (
	`id` varchar(36) NOT NULL,
	`name` varchar(255) NOT NULL,
	`email` varchar(255) NOT NULL,
	`email_verified` boolean NOT NULL DEFAULT false,
	`image` text,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `user_id` PRIMARY KEY(`id`),
	CONSTRAINT `user_email_unique` UNIQUE(`email`)
);
--> statement-breakpoint
CREATE TABLE `verification` (
	`id` varchar(36) NOT NULL,
	`identifier` varchar(255) NOT NULL,
	`value` text NOT NULL,
	`expires_at` datetime(3) NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `verification_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ai_credentials` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`provider` enum('anthropic') NOT NULL,
	`key_enc` varbinary(1024) NOT NULL,
	`key_id` tinyint NOT NULL,
	`key_last4` char(4) NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`revoked_at` datetime(3),
	CONSTRAINT `ai_credentials_id` PRIMARY KEY(`id`),
	CONSTRAINT `ai_credentials_user_provider_uq` UNIQUE(`user_id`,`provider`)
);
--> statement-breakpoint
CREATE TABLE `audit_log` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`user_id` varchar(36),
	`action` varchar(100) NOT NULL,
	`target` varchar(300),
	`meta_json` json,
	`ip_hash` char(64),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `audit_log_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `jobs` (
	`id` char(36) NOT NULL,
	`user_id` varchar(36),
	`kind` varchar(64) NOT NULL,
	`status` enum('queued','running','done','failed') NOT NULL DEFAULT 'queued',
	`attempts` tinyint NOT NULL DEFAULT 0,
	`payload_json` json,
	`result_json` json,
	`error` text,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`finished_at` datetime(3),
	CONSTRAINT `jobs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `profiles` (
	`user_id` varchar(36) NOT NULL,
	`handle` varchar(39) NOT NULL,
	`display_name` varchar(200),
	`bio` text,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `profiles_user_id` PRIMARY KEY(`user_id`),
	CONSTRAINT `profiles_handle_unique` UNIQUE(`handle`)
);
--> statement-breakpoint
CREATE TABLE `runner_tokens` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`token_prefix` char(8) NOT NULL,
	`token_hash` char(64) NOT NULL,
	`scopes` json NOT NULL,
	`expires_at` datetime(3) NOT NULL,
	`revoked` boolean NOT NULL DEFAULT false,
	`last_used_at` datetime(3),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `runner_tokens_id` PRIMARY KEY(`id`),
	CONSTRAINT `runner_tokens_hash_uq` UNIQUE(`token_hash`)
);
--> statement-breakpoint
CREATE TABLE `user_roles` (
	`user_id` varchar(36) NOT NULL,
	`role` enum('learner','reviewer','admin') NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `user_roles_user_id_role_pk` PRIMARY KEY(`user_id`,`role`)
);
--> statement-breakpoint
CREATE TABLE `user_settings` (
	`user_id` varchar(36) NOT NULL,
	`mode` enum('ACC','RI'),
	`hours_per_week` tinyint,
	`timezone` varchar(64) NOT NULL DEFAULT 'America/Toronto',
	`theme` enum('system','light','dark') NOT NULL DEFAULT 'system',
	`sample_data` boolean NOT NULL DEFAULT false,
	`ai_provider` enum('none','anthropic') NOT NULL DEFAULT 'none',
	`ai_model` varchar(80),
	`a11y_pause_timers` boolean NOT NULL DEFAULT false,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `user_settings_user_id` PRIMARY KEY(`user_id`)
);
--> statement-breakpoint
CREATE TABLE `attempt_evidence` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`attempt_id` bigint unsigned NOT NULL,
	`kind` enum('runner_result','server_graded','github_commit','github_ci','reviewer_score','self_rubric','report','recording') NOT NULL,
	`counts` boolean GENERATED ALWAYS AS ((kind IN ('runner_result','server_graded','github_commit','github_ci','reviewer_score'))) STORED,
	`url` varchar(500),
	`commit_sha` char(40),
	`runner_run_id` bigint unsigned,
	`verified` boolean NOT NULL DEFAULT false,
	`verified_at` datetime(3),
	`verify_method` varchar(100),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `attempt_evidence_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `attempts` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`gate_id` varchar(64) NOT NULL,
	`exercise_id` varchar(64),
	`source` enum('browser','runner','server','manual','diagnostic') NOT NULL,
	`status` enum('practice','pending_evidence','passed','failed') NOT NULL,
	`passed` boolean,
	`score` decimal(5,2),
	`result_json` json,
	`evidence_url` varchar(500),
	`commit_sha` char(40),
	`content_version` varchar(40) NOT NULL,
	`hints_used` tinyint NOT NULL DEFAULT 0,
	`is_mock` boolean NOT NULL DEFAULT false,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `attempts_id` PRIMARY KEY(`id`),
	CONSTRAINT `attempts_browser_is_practice` CHECK(`attempts`.`source` <> 'browser' OR `attempts`.`status` = 'practice'),
	CONSTRAINT `attempts_practice_is_browser` CHECK(`attempts`.`status` <> 'practice' OR `attempts`.`source` = 'browser')
);
--> statement-breakpoint
CREATE TABLE `card_reviews` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`card_id` bigint unsigned NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`rating` tinyint NOT NULL,
	`state_before` json NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`elapsed_days` int NOT NULL,
	`scheduled_days` int NOT NULL,
	CONSTRAINT `card_reviews_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `cards` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`skill_id` varchar(64) NOT NULL,
	`week_id` varchar(32) NOT NULL,
	`origin` enum('seed','lesson','user') NOT NULL,
	`front` text NOT NULL,
	`back` text NOT NULL,
	`fsrs_state` json NOT NULL,
	`due_at` datetime(3) NOT NULL,
	`suspended` boolean NOT NULL DEFAULT false,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `cards_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `diagnostic_sessions` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`state_json` json,
	`paused_ms` int NOT NULL DEFAULT 0,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`completed_at` datetime(3),
	`result_json` json,
	CONSTRAINT `diagnostic_sessions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `exercises` (
	`id` varchar(64) NOT NULL,
	`gate_id` varchar(64),
	`week_id` varchar(32) NOT NULL,
	`language` enum('python','c','go','cpp','cuda') NOT NULL,
	`practice_runtime` enum('pyodide','none') NOT NULL,
	`public_tests_uri` varchar(500),
	`gate_tests_ref` varchar(200),
	`solution_uri` varchar(500),
	CONSTRAINT `exercises_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `gate_skills` (
	`gate_id` varchar(64) NOT NULL,
	`skill_id` varchar(64) NOT NULL,
	CONSTRAINT `gate_skills_gate_id_skill_id_pk` PRIMARY KEY(`gate_id`,`skill_id`)
);
--> statement-breakpoint
CREATE TABLE `gates` (
	`id` varchar(64) NOT NULL,
	`week_id` varchar(32) NOT NULL,
	`kind` enum('tests','exam','report','defense') NOT NULL,
	`rubric_json` json,
	`required_evidence` json NOT NULL,
	`skill_ids` json NOT NULL,
	`objective_spec` json,
	`content_version` varchar(40) NOT NULL,
	CONSTRAINT `gates_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `remediation_plans` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`gate_id` varchar(64) NOT NULL,
	`failed_attempt_id` bigint unsigned NOT NULL,
	`track_json` json NOT NULL,
	`status` enum('open','done') NOT NULL DEFAULT 'open',
	`reattempt_after` datetime(3),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `remediation_plans_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `rubric_scores` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`attempt_id` bigint unsigned NOT NULL,
	`criterion` varchar(100) NOT NULL,
	`level` enum('missing','partial','competent','strong') NOT NULL,
	`scorer` enum('self','reviewer','auto','ai_suggested') NOT NULL,
	`scorer_user_id` varchar(36),
	`note` text,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `rubric_scores_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `skill_edges` (
	`from_skill` varchar(64) NOT NULL,
	`to_skill` varchar(64) NOT NULL,
	CONSTRAINT `skill_edges_from_skill_to_skill_pk` PRIMARY KEY(`from_skill`,`to_skill`)
);
--> statement-breakpoint
CREATE TABLE `skills` (
	`id` varchar(64) NOT NULL,
	`name` varchar(200) NOT NULL,
	`area` varchar(64) NOT NULL,
	CONSTRAINT `skills_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `time_logs` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`week_id` varchar(32) NOT NULL,
	`minutes` int NOT NULL,
	`category` varchar(32) NOT NULL,
	`logged_on` date NOT NULL,
	`source` enum('timer','manual') NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `time_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `user_skill_state` (
	`user_id` varchar(36) NOT NULL,
	`skill_id` varchar(64) NOT NULL,
	`level` enum('not_started','developing','competent','verified') NOT NULL DEFAULT 'not_started',
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `user_skill_state_user_id_skill_id_pk` PRIMARY KEY(`user_id`,`skill_id`)
);
--> statement-breakpoint
CREATE TABLE `weeks` (
	`id` varchar(32) NOT NULL,
	`mode` enum('ACC','RI') NOT NULL,
	`ordinal` int NOT NULL,
	`title` varchar(200) NOT NULL,
	`hardware` enum('CPU','GPU_FREE','GPU_RENT') NOT NULL,
	`content_version` varchar(40) NOT NULL,
	`ri_week_ids` json NOT NULL,
	`no_ai_code` boolean NOT NULL DEFAULT false,
	`publish_restricted` boolean NOT NULL DEFAULT false,
	`restriction_note` text,
	CONSTRAINT `weeks_id` PRIMARY KEY(`id`),
	CONSTRAINT `weeks_mode_ordinal_uq` UNIQUE(`mode`,`ordinal`)
);
--> statement-breakpoint
CREATE TABLE `dossier_evidence` (
	`dossier_id` bigint unsigned NOT NULL,
	`source_id` bigint unsigned NOT NULL,
	`claim` text NOT NULL,
	`evidence_date` date,
	`is_primary` boolean NOT NULL DEFAULT false,
	CONSTRAINT `dossier_evidence_dossier_id_source_id_pk` PRIMARY KEY(`dossier_id`,`source_id`)
);
--> statement-breakpoint
CREATE TABLE `dossiers` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`slug` varchar(100) NOT NULL,
	`title` varchar(300) NOT NULL,
	`classification` enum('documented_open_problem','engineering_opportunity','unverified_hypothesis','already_solved','beginner_contribution') NOT NULL,
	`fields_json` json NOT NULL,
	`difficulty` tinyint NOT NULL,
	`feasibility` tinyint NOT NULL,
	`hardware` enum('CPU','GPU_FREE','GPU_RENT','MULTI_GPU') NOT NULL,
	`override_note` text,
	`security_sensitive` boolean NOT NULL DEFAULT false,
	`reviewed_at` datetime(3) NOT NULL,
	CONSTRAINT `dossiers_id` PRIMARY KEY(`id`),
	CONSTRAINT `dossiers_slug_unique` UNIQUE(`slug`),
	CONSTRAINT `dossiers_difficulty_range` CHECK(`dossiers`.`difficulty` BETWEEN 1 AND 5),
	CONSTRAINT `dossiers_feasibility_range` CHECK(`dossiers`.`feasibility` BETWEEN 1 AND 5)
);
--> statement-breakpoint
CREATE TABLE `novelty_checks` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`dossier_id` bigint unsigned,
	`project_id` bigint unsigned,
	`user_id` varchar(36) NOT NULL,
	`queries_json` json NOT NULL,
	`results_json` json NOT NULL,
	`result_label` enum('no prior work found in these searches','related work found') NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `novelty_checks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `papers` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`source_id` bigint unsigned NOT NULL,
	`title` varchar(500) NOT NULL,
	`abstract` text,
	`authors_json` json,
	`user_notes` mediumtext,
	`analysis_json` json,
	`status` enum('to_read','read','analysed') NOT NULL DEFAULT 'to_read',
	`is_mock` boolean NOT NULL DEFAULT false,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `papers_id` PRIMARY KEY(`id`),
	CONSTRAINT `papers_user_source_uq` UNIQUE(`user_id`,`source_id`)
);
--> statement-breakpoint
CREATE TABLE `projects` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`dossier_id` bigint unsigned,
	`title` varchar(300) NOT NULL,
	`hypothesis` text,
	`plan_md` mediumtext,
	`prereg_json` json,
	`preregistered_at` datetime(3),
	`status` enum('draft','running','concluded','abandoned') NOT NULL DEFAULT 'draft',
	`visibility` enum('private','public') NOT NULL DEFAULT 'private',
	`min_repetitions` tinyint NOT NULL DEFAULT 5,
	`is_mock` boolean NOT NULL DEFAULT false,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `projects_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `run_configs` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`project_id` bigint unsigned NOT NULL,
	`name` varchar(200) NOT NULL,
	`config_json` json NOT NULL,
	`config_hash` char(64) NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `run_configs_id` PRIMARY KEY(`id`),
	CONSTRAINT `run_configs_project_hash_uq` UNIQUE(`project_id`,`config_hash`)
);
--> statement-breakpoint
CREATE TABLE `run_gpu_timeline` (
	`run_id` bigint unsigned NOT NULL,
	`seq` int NOT NULL,
	`t_ms` bigint NOT NULL,
	`util_pct` double,
	`mem_mb` double,
	`power_w` double,
	CONSTRAINT `run_gpu_timeline_run_id_seq_pk` PRIMARY KEY(`run_id`,`seq`)
);
--> statement-breakpoint
CREATE TABLE `run_metrics` (
	`run_id` bigint unsigned NOT NULL,
	`metric` varchar(64) NOT NULL,
	`unit` varchar(16) NOT NULL,
	`summary_json` json,
	`client_summary_json` json,
	`n` int,
	`raw_uri` varchar(500),
	CONSTRAINT `run_metrics_run_id_metric_pk` PRIMARY KEY(`run_id`,`metric`)
);
--> statement-breakpoint
CREATE TABLE `run_samples` (
	`run_id` bigint unsigned NOT NULL,
	`metric` varchar(64) NOT NULL,
	`seq` int NOT NULL,
	`value` double NOT NULL,
	`t_ms` bigint,
	CONSTRAINT `run_samples_run_id_metric_seq_pk` PRIMARY KEY(`run_id`,`metric`,`seq`)
);
--> statement-breakpoint
CREATE TABLE `runs` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`project_id` bigint unsigned NOT NULL,
	`config_id` bigint unsigned NOT NULL,
	`is_baseline` boolean NOT NULL DEFAULT false,
	`env_json` json NOT NULL,
	`env_fingerprint` char(64) NOT NULL,
	`status` enum('ok','failed','invalid') NOT NULL,
	`failure_note` text,
	`is_warmup` boolean NOT NULL DEFAULT false,
	`source` enum('runner','upload','notebook') NOT NULL,
	`runner_token_id` bigint unsigned,
	`upload_sha256` char(64),
	`started_at` datetime(3),
	`ended_at` datetime(3),
	`is_mock` boolean NOT NULL DEFAULT false,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `runs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sources` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`kind` enum('paper','repo','course','doc','price','issue','job','blog') NOT NULL,
	`url` varchar(2048) NOT NULL,
	`url_hash` char(64) NOT NULL,
	`final_url` varchar(2048),
	`title` varchar(500),
	`venue` varchar(200),
	`year` smallint,
	`external_id` varchar(100),
	`licence` varchar(100),
	`last_activity_at` datetime(3),
	`verification` enum('verified','partial','unverified','broken') NOT NULL,
	`verified_at` datetime(3),
	`last_checked_at` datetime(3) NOT NULL,
	`verify_method` varchar(100),
	`verify_note` text,
	`fetch_block_reason` varchar(64),
	`raw_json` json,
	`seed_verified_at` datetime(3),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `sources_id` PRIMARY KEY(`id`),
	CONSTRAINT `sources_url_hash_uq` UNIQUE(`url_hash`),
	CONSTRAINT `sources_kind_external_uq` UNIQUE(`kind`,`external_id`)
);
--> statement-breakpoint
CREATE TABLE `contributions` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`repo` varchar(200) NOT NULL,
	`issue_number` int,
	`pr_number` int,
	`state` enum('preparing','pr_opened_by_user','in_review','merged','closed') NOT NULL DEFAULT 'preparing',
	`checklist_json` json,
	`reviews_count` int NOT NULL DEFAULT 0,
	`first_review_at` datetime(3),
	`merged_at` datetime(3),
	`verified_at` datetime(3),
	`pr_author_login` varchar(39),
	`is_mock` boolean NOT NULL DEFAULT false,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `contributions_id` PRIMARY KEY(`id`),
	CONSTRAINT `contributions_user_repo_pr_uq` UNIQUE(`user_id`,`repo`,`pr_number`)
);
--> statement-breakpoint
CREATE TABLE `gh_installations` (
	`id` bigint unsigned NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`token_enc` varbinary(2048),
	`token_expires_at` datetime(3),
	`refresh_enc` varbinary(2048),
	`refresh_expires_at` datetime(3),
	`key_id` tinyint,
	`permissions_json` json,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `gh_installations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `gh_issues` (
	`repo` varchar(200) NOT NULL,
	`number` int NOT NULL,
	`title` varchar(500) NOT NULL,
	`state` varchar(16) NOT NULL,
	`labels_json` json,
	`created_at` datetime,
	`updated_at` datetime,
	`comments` int,
	`linked_prs_json` json,
	`difficulty_est` tinyint,
	`difficulty_reasons` json,
	`maintainer_activity_at` datetime,
	`synced_at` datetime(3),
	`etag` varchar(200),
	CONSTRAINT `gh_issues_repo_number_pk` PRIMARY KEY(`repo`,`number`)
);
--> statement-breakpoint
CREATE TABLE `gh_repos` (
	`full_name` varchar(200) NOT NULL,
	`licence` varchar(100),
	`licence_class` enum('osi','source_available','none','unknown') NOT NULL DEFAULT 'unknown',
	`pushed_at` datetime,
	`stars` int,
	`archived` boolean NOT NULL DEFAULT false,
	`open_issues` int,
	`contributing_url` varchar(500),
	`cla_note` varchar(200),
	`synced_at` datetime(3),
	`etag` varchar(200),
	CONSTRAINT `gh_repos_full_name` PRIMARY KEY(`full_name`)
);
--> statement-breakpoint
CREATE TABLE `ai_budgets` (
	`user_id` varchar(36) NOT NULL,
	`daily_usd` decimal(8,2) NOT NULL DEFAULT '0.50',
	`monthly_usd` decimal(8,2) NOT NULL DEFAULT '5.00',
	`per_request_max_output_tokens` int NOT NULL DEFAULT 2048,
	`spent_today` decimal(10,5) NOT NULL DEFAULT '0',
	`spent_month` decimal(10,5) NOT NULL DEFAULT '0',
	`period_day` date,
	`period_month` char(7),
	CONSTRAINT `ai_budgets_user_id` PRIMARY KEY(`user_id`)
);
--> statement-breakpoint
CREATE TABLE `ai_spend_ledger` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`message_id` bigint unsigned,
	`kind` enum('reservation','settlement','release') NOT NULL,
	`usd` decimal(10,5) NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `ai_spend_ledger_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `interview_sessions` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`kind` enum('coding','system_design','defend','behavioural') NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`ended_at` datetime(3),
	`transcript_md` mediumtext,
	`recording_ref` varchar(300),
	`attempt_id` bigint unsigned,
	CONSTRAINT `interview_sessions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `mentor_messages` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`thread_id` char(36) NOT NULL,
	`role` enum('user','assistant') NOT NULL,
	`mode` varchar(32) NOT NULL,
	`content` mediumtext NOT NULL,
	`cited_source_ids` json,
	`confidence` enum('high','medium','low'),
	`policy_flags` json,
	`provider` varchar(40),
	`model` varchar(80),
	`input_tokens` int,
	`output_tokens` int,
	`cost_usd` decimal(10,5),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `mentor_messages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `mentor_threads` (
	`id` char(36) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`mode` varchar(32) NOT NULL,
	`context_kind` varchar(32),
	`context_id` varchar(64),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `mentor_threads_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `price_table` (
	`provider` varchar(40) NOT NULL,
	`model` varchar(80) NOT NULL,
	`input_per_mtok` decimal(10,4) NOT NULL,
	`output_per_mtok` decimal(10,4) NOT NULL,
	`max_prompt_tokens_for_rate` int,
	`source_id` bigint unsigned,
	`source_url` varchar(500) NOT NULL,
	`verified_at` datetime(3) NOT NULL,
	CONSTRAINT `price_table_provider_model_pk` PRIMARY KEY(`provider`,`model`)
);
--> statement-breakpoint
CREATE TABLE `weaknesses` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`skill_id` varchar(64) NOT NULL,
	`observation` text NOT NULL,
	`evidence_ref` varchar(300),
	`origin` enum('mentor','gate') NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `weaknesses_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `portfolio_items` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`kind` varchar(32) NOT NULL,
	`ref_id` bigint unsigned NOT NULL,
	`slug` varchar(120) NOT NULL,
	`published` boolean NOT NULL DEFAULT false,
	`checks_json` json,
	`published_at` datetime(3),
	`evidence_verified_at` datetime(3),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `portfolio_items_id` PRIMARY KEY(`id`),
	CONSTRAINT `portfolio_user_slug_uq` UNIQUE(`user_id`,`slug`)
);
--> statement-breakpoint
CREATE TABLE `writing_drafts` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`kind` enum('linkedin','resume_bullet','blog') NOT NULL,
	`sentences_json` json NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `writing_drafts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `account` ADD CONSTRAINT `account_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `session` ADD CONSTRAINT `session_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ai_credentials` ADD CONSTRAINT `ai_credentials_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `audit_log` ADD CONSTRAINT `audit_log_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `jobs` ADD CONSTRAINT `jobs_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `profiles` ADD CONSTRAINT `profiles_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `runner_tokens` ADD CONSTRAINT `runner_tokens_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `user_roles` ADD CONSTRAINT `user_roles_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `user_settings` ADD CONSTRAINT `user_settings_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `attempt_evidence` ADD CONSTRAINT `attempt_evidence_attempt_id_attempts_id_fk` FOREIGN KEY (`attempt_id`) REFERENCES `attempts`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `attempts` ADD CONSTRAINT `attempts_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `attempts` ADD CONSTRAINT `attempts_gate_id_gates_id_fk` FOREIGN KEY (`gate_id`) REFERENCES `gates`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `attempts` ADD CONSTRAINT `attempts_exercise_id_exercises_id_fk` FOREIGN KEY (`exercise_id`) REFERENCES `exercises`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `card_reviews` ADD CONSTRAINT `card_reviews_card_id_cards_id_fk` FOREIGN KEY (`card_id`) REFERENCES `cards`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `card_reviews` ADD CONSTRAINT `card_reviews_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `cards` ADD CONSTRAINT `cards_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `cards` ADD CONSTRAINT `cards_skill_id_skills_id_fk` FOREIGN KEY (`skill_id`) REFERENCES `skills`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `cards` ADD CONSTRAINT `cards_week_id_weeks_id_fk` FOREIGN KEY (`week_id`) REFERENCES `weeks`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `diagnostic_sessions` ADD CONSTRAINT `diagnostic_sessions_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `exercises` ADD CONSTRAINT `exercises_gate_id_gates_id_fk` FOREIGN KEY (`gate_id`) REFERENCES `gates`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `exercises` ADD CONSTRAINT `exercises_week_id_weeks_id_fk` FOREIGN KEY (`week_id`) REFERENCES `weeks`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `gate_skills` ADD CONSTRAINT `gate_skills_gate_id_gates_id_fk` FOREIGN KEY (`gate_id`) REFERENCES `gates`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `gate_skills` ADD CONSTRAINT `gate_skills_skill_id_skills_id_fk` FOREIGN KEY (`skill_id`) REFERENCES `skills`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `gates` ADD CONSTRAINT `gates_week_id_weeks_id_fk` FOREIGN KEY (`week_id`) REFERENCES `weeks`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `remediation_plans` ADD CONSTRAINT `remediation_plans_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `remediation_plans` ADD CONSTRAINT `remediation_plans_gate_id_gates_id_fk` FOREIGN KEY (`gate_id`) REFERENCES `gates`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `remediation_plans` ADD CONSTRAINT `remediation_plans_failed_attempt_id_attempts_id_fk` FOREIGN KEY (`failed_attempt_id`) REFERENCES `attempts`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `rubric_scores` ADD CONSTRAINT `rubric_scores_attempt_id_attempts_id_fk` FOREIGN KEY (`attempt_id`) REFERENCES `attempts`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `rubric_scores` ADD CONSTRAINT `rubric_scores_scorer_user_id_user_id_fk` FOREIGN KEY (`scorer_user_id`) REFERENCES `user`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `skill_edges` ADD CONSTRAINT `skill_edges_from_skill_skills_id_fk` FOREIGN KEY (`from_skill`) REFERENCES `skills`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `skill_edges` ADD CONSTRAINT `skill_edges_to_skill_skills_id_fk` FOREIGN KEY (`to_skill`) REFERENCES `skills`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `time_logs` ADD CONSTRAINT `time_logs_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `time_logs` ADD CONSTRAINT `time_logs_week_id_weeks_id_fk` FOREIGN KEY (`week_id`) REFERENCES `weeks`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `user_skill_state` ADD CONSTRAINT `user_skill_state_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `user_skill_state` ADD CONSTRAINT `user_skill_state_skill_id_skills_id_fk` FOREIGN KEY (`skill_id`) REFERENCES `skills`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `dossier_evidence` ADD CONSTRAINT `dossier_evidence_dossier_id_dossiers_id_fk` FOREIGN KEY (`dossier_id`) REFERENCES `dossiers`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `dossier_evidence` ADD CONSTRAINT `dossier_evidence_source_id_sources_id_fk` FOREIGN KEY (`source_id`) REFERENCES `sources`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `novelty_checks` ADD CONSTRAINT `novelty_checks_dossier_id_dossiers_id_fk` FOREIGN KEY (`dossier_id`) REFERENCES `dossiers`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `novelty_checks` ADD CONSTRAINT `novelty_checks_project_id_projects_id_fk` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `novelty_checks` ADD CONSTRAINT `novelty_checks_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `papers` ADD CONSTRAINT `papers_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `papers` ADD CONSTRAINT `papers_source_id_sources_id_fk` FOREIGN KEY (`source_id`) REFERENCES `sources`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `projects` ADD CONSTRAINT `projects_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `projects` ADD CONSTRAINT `projects_dossier_id_dossiers_id_fk` FOREIGN KEY (`dossier_id`) REFERENCES `dossiers`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `run_configs` ADD CONSTRAINT `run_configs_project_id_projects_id_fk` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `run_gpu_timeline` ADD CONSTRAINT `run_gpu_timeline_run_id_runs_id_fk` FOREIGN KEY (`run_id`) REFERENCES `runs`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `run_metrics` ADD CONSTRAINT `run_metrics_run_id_runs_id_fk` FOREIGN KEY (`run_id`) REFERENCES `runs`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `run_samples` ADD CONSTRAINT `run_samples_run_id_runs_id_fk` FOREIGN KEY (`run_id`) REFERENCES `runs`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `runs` ADD CONSTRAINT `runs_project_id_projects_id_fk` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `runs` ADD CONSTRAINT `runs_config_id_run_configs_id_fk` FOREIGN KEY (`config_id`) REFERENCES `run_configs`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `runs` ADD CONSTRAINT `runs_runner_token_id_runner_tokens_id_fk` FOREIGN KEY (`runner_token_id`) REFERENCES `runner_tokens`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `contributions` ADD CONSTRAINT `contributions_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `gh_installations` ADD CONSTRAINT `gh_installations_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `gh_issues` ADD CONSTRAINT `gh_issues_repo_gh_repos_full_name_fk` FOREIGN KEY (`repo`) REFERENCES `gh_repos`(`full_name`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ai_budgets` ADD CONSTRAINT `ai_budgets_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ai_spend_ledger` ADD CONSTRAINT `ai_spend_ledger_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ai_spend_ledger` ADD CONSTRAINT `ai_spend_ledger_message_id_mentor_messages_id_fk` FOREIGN KEY (`message_id`) REFERENCES `mentor_messages`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `interview_sessions` ADD CONSTRAINT `interview_sessions_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `interview_sessions` ADD CONSTRAINT `interview_sessions_attempt_id_attempts_id_fk` FOREIGN KEY (`attempt_id`) REFERENCES `attempts`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `mentor_messages` ADD CONSTRAINT `mentor_messages_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `mentor_messages` ADD CONSTRAINT `mentor_messages_thread_id_mentor_threads_id_fk` FOREIGN KEY (`thread_id`) REFERENCES `mentor_threads`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `mentor_threads` ADD CONSTRAINT `mentor_threads_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `price_table` ADD CONSTRAINT `price_table_source_id_sources_id_fk` FOREIGN KEY (`source_id`) REFERENCES `sources`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `weaknesses` ADD CONSTRAINT `weaknesses_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `weaknesses` ADD CONSTRAINT `weaknesses_skill_id_skills_id_fk` FOREIGN KEY (`skill_id`) REFERENCES `skills`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `portfolio_items` ADD CONSTRAINT `portfolio_items_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `writing_drafts` ADD CONSTRAINT `writing_drafts_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `account_user_idx` ON `account` (`user_id`);--> statement-breakpoint
CREATE INDEX `session_user_idx` ON `session` (`user_id`);--> statement-breakpoint
CREATE INDEX `verification_identifier_idx` ON `verification` (`identifier`);--> statement-breakpoint
CREATE INDEX `audit_user_created_idx` ON `audit_log` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `jobs_user_created_idx` ON `jobs` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `jobs_status_idx` ON `jobs` (`status`);--> statement-breakpoint
CREATE INDEX `runner_tokens_user_idx` ON `runner_tokens` (`user_id`);--> statement-breakpoint
CREATE INDEX `attempt_evidence_attempt_idx` ON `attempt_evidence` (`attempt_id`);--> statement-breakpoint
CREATE INDEX `attempts_user_gate_created_idx` ON `attempts` (`user_id`,`gate_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `card_reviews_user_idx` ON `card_reviews` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `cards_user_due_idx` ON `cards` (`user_id`,`due_at`);--> statement-breakpoint
CREATE INDEX `diagnostic_user_idx` ON `diagnostic_sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX `exercises_week_idx` ON `exercises` (`week_id`);--> statement-breakpoint
CREATE INDEX `gates_week_idx` ON `gates` (`week_id`);--> statement-breakpoint
CREATE INDEX `remediation_user_status_idx` ON `remediation_plans` (`user_id`,`status`);--> statement-breakpoint
CREATE INDEX `rubric_scores_attempt_idx` ON `rubric_scores` (`attempt_id`);--> statement-breakpoint
CREATE INDEX `skill_edges_to_idx` ON `skill_edges` (`to_skill`);--> statement-breakpoint
CREATE INDEX `time_logs_user_day_idx` ON `time_logs` (`user_id`,`logged_on`);--> statement-breakpoint
CREATE INDEX `dossiers_classification_idx` ON `dossiers` (`classification`);--> statement-breakpoint
CREATE INDEX `novelty_dossier_idx` ON `novelty_checks` (`dossier_id`);--> statement-breakpoint
CREATE INDEX `novelty_project_idx` ON `novelty_checks` (`project_id`);--> statement-breakpoint
CREATE INDEX `projects_user_idx` ON `projects` (`user_id`);--> statement-breakpoint
CREATE INDEX `run_configs_project_idx` ON `run_configs` (`project_id`);--> statement-breakpoint
CREATE INDEX `runs_project_idx` ON `runs` (`project_id`);--> statement-breakpoint
CREATE INDEX `runs_project_config_env_idx` ON `runs` (`project_id`,`config_id`,`env_fingerprint`);--> statement-breakpoint
CREATE INDEX `sources_kind_idx` ON `sources` (`kind`);--> statement-breakpoint
CREATE INDEX `sources_verified_at_idx` ON `sources` (`verified_at`);--> statement-breakpoint
CREATE INDEX `contributions_user_idx` ON `contributions` (`user_id`);--> statement-breakpoint
CREATE INDEX `gh_installations_user_idx` ON `gh_installations` (`user_id`);--> statement-breakpoint
CREATE INDEX `gh_issues_repo_state_idx` ON `gh_issues` (`repo`,`state`);--> statement-breakpoint
CREATE INDEX `ai_ledger_user_created_idx` ON `ai_spend_ledger` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `interview_user_idx` ON `interview_sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX `mentor_messages_thread_idx` ON `mentor_messages` (`thread_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `mentor_threads_user_idx` ON `mentor_threads` (`user_id`);--> statement-breakpoint
CREATE INDEX `weaknesses_user_idx` ON `weaknesses` (`user_id`);--> statement-breakpoint
CREATE INDEX `writing_drafts_user_idx` ON `writing_drafts` (`user_id`);