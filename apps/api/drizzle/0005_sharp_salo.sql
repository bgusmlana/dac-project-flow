CREATE INDEX `activity_logs_created_idx` ON `activity_logs` (`created_at`);--> statement-breakpoint
CREATE INDEX `unit_stage_logs_created_idx` ON `unit_stage_logs` (`created_at`);--> statement-breakpoint
CREATE INDEX `unit_stage_logs_user_created_idx` ON `unit_stage_logs` (`user_id`,`created_at`);