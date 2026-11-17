ALTER TABLE `attempt_evidence` ADD `passed` boolean;--> statement-breakpoint
ALTER TABLE `attempt_evidence` ADD `ref` varchar(200);--> statement-breakpoint
ALTER TABLE `attempt_evidence` ADD `quiz_id` varchar(64);