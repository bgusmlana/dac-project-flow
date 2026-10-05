CREATE TABLE `unit_components` (
	`id` int AUTO_INCREMENT NOT NULL,
	`unit_id` bigint unsigned NOT NULL,
	`component_category_id` int NOT NULL,
	`brand` varchar(100) NOT NULL,
	`model` varchar(150) NOT NULL,
	`serial_number` varchar(100),
	`installed_by` varchar(36),
	`created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `unit_components_id` PRIMARY KEY(`id`),
	CONSTRAINT `unit_components_serial_number_unique` UNIQUE(`serial_number`)
);
--> statement-breakpoint
ALTER TABLE `unit_components` ADD CONSTRAINT `unit_components_unit_id_units_id_fk` FOREIGN KEY (`unit_id`) REFERENCES `units`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `unit_components` ADD CONSTRAINT `unit_components_component_category_id_component_categories_id_fk` FOREIGN KEY (`component_category_id`) REFERENCES `component_categories`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `unit_components_unit_idx` ON `unit_components` (`unit_id`);