CREATE TABLE `import_jobs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`type` varchar(30) NOT NULL,
	`project_id` int,
	`project_item_id` int,
	`file_name` varchar(255) NOT NULL,
	`file_path` varchar(500) NOT NULL,
	`status` enum('queued','processing','done','failed') NOT NULL DEFAULT 'queued',
	`total_rows` int NOT NULL DEFAULT 0,
	`processed_rows` int NOT NULL DEFAULT 0,
	`success_rows` int NOT NULL DEFAULT 0,
	`failed_rows` int NOT NULL DEFAULT 0,
	`errors` json NOT NULL,
	`message` text,
	`created_by` varchar(36),
	`created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `import_jobs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `project_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`project_id` int NOT NULL,
	`product_id` int NOT NULL,
	`vendor_id` int NOT NULL,
	`product_type_id` int NOT NULL,
	`brand` varchar(100) NOT NULL,
	`model` varchar(150) NOT NULL,
	`part_number` varchar(100),
	`specification` text,
	`quantity` int NOT NULL,
	`stages` json NOT NULL,
	`accessories` json NOT NULL,
	`created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `project_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `project_stage_counters` (
	`project_id` int NOT NULL,
	`status` enum('assembling','activation','qc','packing','shipping','installation','completed') NOT NULL,
	`count` int NOT NULL DEFAULT 0,
	CONSTRAINT `psc_pk` PRIMARY KEY(`project_id`,`status`)
);
--> statement-breakpoint
CREATE TABLE `projects` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(30) NOT NULL,
	`name` varchar(200) NOT NULL,
	`client_id` int NOT NULL,
	`po_number` varchar(100),
	`target_date` date,
	`pic_user_id` varchar(36),
	`shipping_address` text,
	`notes` text,
	`status` enum('draft','in_progress','completed','cancelled') NOT NULL DEFAULT 'draft',
	`qc_mode` enum('per_unit','sampling') NOT NULL DEFAULT 'per_unit',
	`lot_size` int,
	`sample_percent` decimal(5,2),
	`max_sample_fail` int,
	`created_by` varchar(36),
	`created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `projects_id` PRIMARY KEY(`id`),
	CONSTRAINT `projects_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `secret_access_logs` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`entity_type` varchar(30) NOT NULL,
	`entity_id` varchar(64) NOT NULL,
	`field` varchar(50),
	`action` varchar(20) NOT NULL,
	`ip_address` varchar(64),
	`created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `secret_access_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `unit_accessories` (
	`id` int AUTO_INCREMENT NOT NULL,
	`unit_id` bigint unsigned NOT NULL,
	`name` varchar(100) NOT NULL,
	`serial_number` varchar(100),
	`created_by` varchar(36),
	`created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `unit_accessories_id` PRIMARY KEY(`id`),
	CONSTRAINT `unit_accessories_serial_number_unique` UNIQUE(`serial_number`)
);
--> statement-breakpoint
CREATE TABLE `unit_stage_logs` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`unit_id` bigint unsigned NOT NULL,
	`from_status` enum('assembling','activation','qc','packing','shipping','installation','completed'),
	`to_status` enum('assembling','activation','qc','packing','shipping','installation','completed') NOT NULL,
	`action` varchar(30) NOT NULL,
	`note` text,
	`user_id` varchar(36),
	`created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `unit_stage_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `units` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`project_id` int NOT NULL,
	`project_item_id` int NOT NULL,
	`lot_id` int,
	`package_id` int,
	`serial_number` varchar(100) NOT NULL,
	`status` enum('assembling','activation','qc','packing','shipping','installation','completed') NOT NULL,
	`custom_fields` json NOT NULL,
	`created_by` varchar(36),
	`created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `units_id` PRIMARY KEY(`id`),
	CONSTRAINT `units_serial_number_unique` UNIQUE(`serial_number`)
);
--> statement-breakpoint
ALTER TABLE `project_items` ADD CONSTRAINT `project_items_project_id_projects_id_fk` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `project_items` ADD CONSTRAINT `project_items_product_id_products_id_fk` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `project_items` ADD CONSTRAINT `project_items_vendor_id_vendors_id_fk` FOREIGN KEY (`vendor_id`) REFERENCES `vendors`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `project_items` ADD CONSTRAINT `project_items_product_type_id_product_types_id_fk` FOREIGN KEY (`product_type_id`) REFERENCES `product_types`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `project_stage_counters` ADD CONSTRAINT `project_stage_counters_project_id_projects_id_fk` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `projects` ADD CONSTRAINT `projects_client_id_clients_id_fk` FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `projects` ADD CONSTRAINT `projects_pic_user_id_users_id_fk` FOREIGN KEY (`pic_user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `unit_accessories` ADD CONSTRAINT `unit_accessories_unit_id_units_id_fk` FOREIGN KEY (`unit_id`) REFERENCES `units`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `unit_stage_logs` ADD CONSTRAINT `unit_stage_logs_unit_id_units_id_fk` FOREIGN KEY (`unit_id`) REFERENCES `units`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `units` ADD CONSTRAINT `units_project_id_projects_id_fk` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `units` ADD CONSTRAINT `units_project_item_id_project_items_id_fk` FOREIGN KEY (`project_item_id`) REFERENCES `project_items`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `import_jobs_project_idx` ON `import_jobs` (`project_id`);--> statement-breakpoint
CREATE INDEX `project_items_project_idx` ON `project_items` (`project_id`);--> statement-breakpoint
CREATE INDEX `projects_client_idx` ON `projects` (`client_id`);--> statement-breakpoint
CREATE INDEX `projects_status_idx` ON `projects` (`status`);--> statement-breakpoint
CREATE INDEX `secret_access_logs_entity_idx` ON `secret_access_logs` (`entity_type`,`entity_id`);--> statement-breakpoint
CREATE INDEX `unit_accessories_unit_idx` ON `unit_accessories` (`unit_id`);--> statement-breakpoint
CREATE INDEX `unit_stage_logs_unit_idx` ON `unit_stage_logs` (`unit_id`);--> statement-breakpoint
CREATE INDEX `units_project_status_idx` ON `units` (`project_id`,`status`);--> statement-breakpoint
CREATE INDEX `units_item_idx` ON `units` (`project_item_id`);--> statement-breakpoint
CREATE INDEX `units_lot_idx` ON `units` (`lot_id`);--> statement-breakpoint
CREATE INDEX `units_package_idx` ON `units` (`package_id`);