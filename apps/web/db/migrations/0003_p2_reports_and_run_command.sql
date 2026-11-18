CREATE TABLE `project_reports` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`project_id` bigint unsigned NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`job_id` char(36) NOT NULL,
	`status` enum('queued','done','failed') NOT NULL DEFAULT 'queued',
	`markdown` mediumtext,
	`html` mediumtext,
	`run_ids` json NOT NULL,
	`error` text,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`finished_at` datetime(3),
	CONSTRAINT `project_reports_id` PRIMARY KEY(`id`),
	CONSTRAINT `project_reports_job_uq` UNIQUE(`job_id`)
);
--> statement-breakpoint
ALTER TABLE `runs` ADD `command` varchar(2000);--> statement-breakpoint
ALTER TABLE `project_reports` ADD CONSTRAINT `project_reports_project_id_projects_id_fk` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `project_reports` ADD CONSTRAINT `project_reports_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `project_reports_project_idx` ON `project_reports` (`project_id`);