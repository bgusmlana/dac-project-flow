CREATE TABLE `activations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`unit_id` bigint unsigned NOT NULL,
	`activation_type_id` int,
	`software_id` int,
	`software_version` varchar(50),
	`license_key_id` int,
	`result` enum('success','failed') NOT NULL,
	`notes` text,
	`performed_by` varchar(36),
	`created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `activations_id` PRIMARY KEY(`id`),
	CONSTRAINT `activations_license_key_id_unique` UNIQUE(`license_key_id`)
);
--> statement-breakpoint
CREATE TABLE `attachments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`entity_type` varchar(30) NOT NULL,
	`entity_id` bigint unsigned NOT NULL,
	`category` varchar(30) NOT NULL,
	`storage_key` varchar(255) NOT NULL,
	`thumb_key` varchar(255) NOT NULL,
	`original_name` varchar(255) NOT NULL,
	`mime_type` varchar(100) NOT NULL,
	`size_bytes` int NOT NULL,
	`uploaded_by` varchar(36),
	`created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `attachments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `installations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`unit_id` bigint unsigned NOT NULL,
	`location` varchar(300) NOT NULL,
	`notes` text,
	`installed_by` varchar(36),
	`created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `installations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `license_keys` (
	`id` int AUTO_INCREMENT NOT NULL,
	`activation_type_id` int,
	`software_id` int,
	`key_encrypted` text NOT NULL,
	`key_hash` char(64) NOT NULL,
	`key_last5` varchar(5) NOT NULL,
	`project_id` int,
	`status` enum('available','assigned','activated','failed','revoked') NOT NULL DEFAULT 'available',
	`valid_until` date,
	`created_by` varchar(36),
	`created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `license_keys_id` PRIMARY KEY(`id`),
	CONSTRAINT `license_keys_key_hash_unique` UNIQUE(`key_hash`)
);
--> statement-breakpoint
CREATE TABLE `lot_samples` (
	`lot_id` int NOT NULL,
	`unit_id` bigint unsigned NOT NULL,
	CONSTRAINT `lot_samples_pk` PRIMARY KEY(`lot_id`,`unit_id`)
);
--> statement-breakpoint
CREATE TABLE `lots` (
	`id` int AUTO_INCREMENT NOT NULL,
	`project_id` int NOT NULL,
	`code` varchar(30) NOT NULL,
	`status` enum('sampling','passed','on_hold','released','reworked') NOT NULL DEFAULT 'sampling',
	`size` int NOT NULL,
	`sample_size` int NOT NULL,
	`max_sample_fail` int NOT NULL,
	`decision_note` text,
	`decided_by` varchar(36),
	`created_by` varchar(36),
	`created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `lots_id` PRIMARY KEY(`id`),
	CONSTRAINT `lots_project_code_uq` UNIQUE(`project_id`,`code`)
);
--> statement-breakpoint
CREATE TABLE `packages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`project_id` int NOT NULL,
	`code` varchar(50) NOT NULL,
	`status` enum('open','sealed','shipped','delivered') NOT NULL DEFAULT 'open',
	`weight_kg` decimal(10,2),
	`notes` text,
	`shipment_id` int,
	`packed_by` varchar(36),
	`sealed_at` datetime(3),
	`created_by` varchar(36),
	`created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `packages_id` PRIMARY KEY(`id`),
	CONSTRAINT `packages_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `qc_inspection_results` (
	`id` int AUTO_INCREMENT NOT NULL,
	`qc_inspection_id` int NOT NULL,
	`qc_template_item_id` int NOT NULL,
	`passed` boolean,
	`value` varchar(500),
	CONSTRAINT `qc_inspection_results_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `qc_inspections` (
	`id` int AUTO_INCREMENT NOT NULL,
	`unit_id` bigint unsigned NOT NULL,
	`lot_id` int,
	`qc_template_id` int NOT NULL,
	`result` enum('pass','fail') NOT NULL,
	`rework_to` enum('assembling','activation'),
	`notes` text,
	`inspected_by` varchar(36),
	`created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `qc_inspections_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `shipments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`project_id` int NOT NULL,
	`code` varchar(50) NOT NULL,
	`status` enum('preparing','shipped','delivered') NOT NULL DEFAULT 'preparing',
	`courier_id` int,
	`tracking_number` varchar(100),
	`vehicle_info` varchar(100),
	`notes` text,
	`shipped_at` datetime(3),
	`received_at` datetime(3),
	`received_by_name` varchar(150),
	`created_by` varchar(36),
	`created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `shipments_id` PRIMARY KEY(`id`),
	CONSTRAINT `shipments_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
ALTER TABLE `activations` ADD CONSTRAINT `activations_unit_id_units_id_fk` FOREIGN KEY (`unit_id`) REFERENCES `units`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `activations` ADD CONSTRAINT `activations_activation_type_id_activation_types_id_fk` FOREIGN KEY (`activation_type_id`) REFERENCES `activation_types`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `activations` ADD CONSTRAINT `activations_software_id_software_id_fk` FOREIGN KEY (`software_id`) REFERENCES `software`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `activations` ADD CONSTRAINT `activations_license_key_id_license_keys_id_fk` FOREIGN KEY (`license_key_id`) REFERENCES `license_keys`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `installations` ADD CONSTRAINT `installations_unit_id_units_id_fk` FOREIGN KEY (`unit_id`) REFERENCES `units`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `license_keys` ADD CONSTRAINT `license_keys_activation_type_id_activation_types_id_fk` FOREIGN KEY (`activation_type_id`) REFERENCES `activation_types`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `license_keys` ADD CONSTRAINT `license_keys_software_id_software_id_fk` FOREIGN KEY (`software_id`) REFERENCES `software`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `license_keys` ADD CONSTRAINT `license_keys_project_id_projects_id_fk` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `lot_samples` ADD CONSTRAINT `lot_samples_lot_id_lots_id_fk` FOREIGN KEY (`lot_id`) REFERENCES `lots`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `lot_samples` ADD CONSTRAINT `lot_samples_unit_id_units_id_fk` FOREIGN KEY (`unit_id`) REFERENCES `units`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `lots` ADD CONSTRAINT `lots_project_id_projects_id_fk` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `packages` ADD CONSTRAINT `packages_project_id_projects_id_fk` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `qc_inspection_results` ADD CONSTRAINT `qc_inspection_results_qc_inspection_id_qc_inspections_id_fk` FOREIGN KEY (`qc_inspection_id`) REFERENCES `qc_inspections`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `qc_inspection_results` ADD CONSTRAINT `qc_results_template_item_fk` FOREIGN KEY (`qc_template_item_id`) REFERENCES `qc_template_items`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `qc_inspections` ADD CONSTRAINT `qc_inspections_unit_id_units_id_fk` FOREIGN KEY (`unit_id`) REFERENCES `units`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `qc_inspections` ADD CONSTRAINT `qc_inspections_lot_id_lots_id_fk` FOREIGN KEY (`lot_id`) REFERENCES `lots`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `qc_inspections` ADD CONSTRAINT `qc_inspections_qc_template_id_qc_templates_id_fk` FOREIGN KEY (`qc_template_id`) REFERENCES `qc_templates`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `shipments` ADD CONSTRAINT `shipments_project_id_projects_id_fk` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `shipments` ADD CONSTRAINT `shipments_courier_id_couriers_id_fk` FOREIGN KEY (`courier_id`) REFERENCES `couriers`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `activations_unit_idx` ON `activations` (`unit_id`);--> statement-breakpoint
CREATE INDEX `attachments_entity_idx` ON `attachments` (`entity_type`,`entity_id`);--> statement-breakpoint
CREATE INDEX `installations_unit_idx` ON `installations` (`unit_id`);--> statement-breakpoint
CREATE INDEX `license_keys_type_status_idx` ON `license_keys` (`activation_type_id`,`status`,`project_id`);--> statement-breakpoint
CREATE INDEX `license_keys_sw_status_idx` ON `license_keys` (`software_id`,`status`,`project_id`);--> statement-breakpoint
CREATE INDEX `license_keys_last5_idx` ON `license_keys` (`key_last5`);--> statement-breakpoint
CREATE INDEX `packages_project_idx` ON `packages` (`project_id`);--> statement-breakpoint
CREATE INDEX `packages_shipment_idx` ON `packages` (`shipment_id`);--> statement-breakpoint
CREATE INDEX `qc_results_inspection_idx` ON `qc_inspection_results` (`qc_inspection_id`);--> statement-breakpoint
CREATE INDEX `qc_inspections_unit_idx` ON `qc_inspections` (`unit_id`);--> statement-breakpoint
CREATE INDEX `qc_inspections_lot_idx` ON `qc_inspections` (`lot_id`);--> statement-breakpoint
CREATE INDEX `shipments_project_idx` ON `shipments` (`project_id`);