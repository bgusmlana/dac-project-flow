CREATE TABLE `activation_types` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(150) NOT NULL,
	`kind` enum('os','software','other') NOT NULL,
	`is_active` boolean NOT NULL DEFAULT true,
	`created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `activation_types_id` PRIMARY KEY(`id`),
	CONSTRAINT `activation_types_name_unique` UNIQUE(`name`)
);
--> statement-breakpoint
CREATE TABLE `clients` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(150) NOT NULL,
	`type` enum('dinas','instansi','swasta','lainnya') NOT NULL,
	`address` varchar(500),
	`contact_name` varchar(100),
	`phone` varchar(30),
	`email` varchar(150),
	`is_active` boolean NOT NULL DEFAULT true,
	`created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `clients_id` PRIMARY KEY(`id`),
	CONSTRAINT `clients_name_unique` UNIQUE(`name`)
);
--> statement-breakpoint
CREATE TABLE `component_categories` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(150) NOT NULL,
	`is_active` boolean NOT NULL DEFAULT true,
	`created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `component_categories_id` PRIMARY KEY(`id`),
	CONSTRAINT `component_categories_name_unique` UNIQUE(`name`)
);
--> statement-breakpoint
CREATE TABLE `couriers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(150) NOT NULL,
	`is_active` boolean NOT NULL DEFAULT true,
	`created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `couriers_id` PRIMARY KEY(`id`),
	CONSTRAINT `couriers_name_unique` UNIQUE(`name`)
);
--> statement-breakpoint
CREATE TABLE `custom_field_definitions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`product_type_id` int NOT NULL,
	`key` varchar(50) NOT NULL,
	`label` varchar(100) NOT NULL,
	`input_type` enum('text','number','select','date','serial') NOT NULL,
	`options` json,
	`is_required` boolean NOT NULL DEFAULT false,
	`is_secret` boolean NOT NULL DEFAULT false,
	`sort_order` int NOT NULL DEFAULT 0,
	`created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `custom_field_definitions_id` PRIMARY KEY(`id`),
	CONSTRAINT `custom_field_type_key_uq` UNIQUE(`product_type_id`,`key`)
);
--> statement-breakpoint
CREATE TABLE `product_type_activation_types` (
	`product_type_id` int NOT NULL,
	`activation_type_id` int NOT NULL,
	CONSTRAINT `ptat_pk` PRIMARY KEY(`product_type_id`,`activation_type_id`)
);
--> statement-breakpoint
CREATE TABLE `product_type_component_categories` (
	`product_type_id` int NOT NULL,
	`component_category_id` int NOT NULL,
	CONSTRAINT `ptcc_pk` PRIMARY KEY(`product_type_id`,`component_category_id`)
);
--> statement-breakpoint
CREATE TABLE `product_type_stages` (
	`product_type_id` int NOT NULL,
	`stage` enum('assembling','activation','qc','packing','shipping','installation') NOT NULL,
	`requirement` enum('required','optional','skipped') NOT NULL,
	CONSTRAINT `pts_pk` PRIMARY KEY(`product_type_id`,`stage`)
);
--> statement-breakpoint
CREATE TABLE `product_types` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(20) NOT NULL,
	`name` varchar(150) NOT NULL,
	`is_active` boolean NOT NULL DEFAULT true,
	`created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `product_types_id` PRIMARY KEY(`id`),
	CONSTRAINT `product_types_code_unique` UNIQUE(`code`),
	CONSTRAINT `product_types_name_unique` UNIQUE(`name`)
);
--> statement-breakpoint
CREATE TABLE `products` (
	`id` int AUTO_INCREMENT NOT NULL,
	`product_type_id` int NOT NULL,
	`brand` varchar(100) NOT NULL,
	`model` varchar(150) NOT NULL,
	`part_number` varchar(100),
	`specification` text,
	`is_active` boolean NOT NULL DEFAULT true,
	`created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `products_id` PRIMARY KEY(`id`),
	CONSTRAINT `products_brand_pn_uq` UNIQUE(`brand`,`part_number`)
);
--> statement-breakpoint
CREATE TABLE `qc_template_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`qc_template_id` int NOT NULL,
	`label` varchar(200) NOT NULL,
	`input_type` enum('pass_fail','number','text') NOT NULL,
	`is_required` boolean NOT NULL DEFAULT true,
	`sort_order` int NOT NULL DEFAULT 0,
	CONSTRAINT `qc_template_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `qc_templates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`product_type_id` int NOT NULL,
	`version` int NOT NULL,
	`is_active` boolean NOT NULL DEFAULT true,
	`created_by` varchar(36),
	`created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `qc_templates_id` PRIMARY KEY(`id`),
	CONSTRAINT `qc_template_type_version_uq` UNIQUE(`product_type_id`,`version`)
);
--> statement-breakpoint
CREATE TABLE `software` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(150) NOT NULL,
	`publisher` varchar(150),
	`is_active` boolean NOT NULL DEFAULT true,
	`created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `software_id` PRIMARY KEY(`id`),
	CONSTRAINT `software_name_unique` UNIQUE(`name`)
);
--> statement-breakpoint
CREATE TABLE `vendors` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(150) NOT NULL,
	`type` enum('supplier','vendor','prinsipal') NOT NULL,
	`contact_name` varchar(100),
	`phone` varchar(30),
	`email` varchar(150),
	`is_active` boolean NOT NULL DEFAULT true,
	`created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `vendors_id` PRIMARY KEY(`id`),
	CONSTRAINT `vendors_name_unique` UNIQUE(`name`)
);
--> statement-breakpoint
ALTER TABLE `custom_field_definitions` ADD CONSTRAINT `custom_field_definitions_product_type_id_product_types_id_fk` FOREIGN KEY (`product_type_id`) REFERENCES `product_types`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `product_type_activation_types` ADD CONSTRAINT `ptat_product_type_fk` FOREIGN KEY (`product_type_id`) REFERENCES `product_types`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `product_type_activation_types` ADD CONSTRAINT `ptat_activation_type_fk` FOREIGN KEY (`activation_type_id`) REFERENCES `activation_types`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `product_type_component_categories` ADD CONSTRAINT `ptcc_product_type_fk` FOREIGN KEY (`product_type_id`) REFERENCES `product_types`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `product_type_component_categories` ADD CONSTRAINT `ptcc_component_category_fk` FOREIGN KEY (`component_category_id`) REFERENCES `component_categories`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `product_type_stages` ADD CONSTRAINT `product_type_stages_product_type_id_product_types_id_fk` FOREIGN KEY (`product_type_id`) REFERENCES `product_types`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `products` ADD CONSTRAINT `products_product_type_id_product_types_id_fk` FOREIGN KEY (`product_type_id`) REFERENCES `product_types`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `qc_template_items` ADD CONSTRAINT `qc_template_items_qc_template_id_qc_templates_id_fk` FOREIGN KEY (`qc_template_id`) REFERENCES `qc_templates`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `qc_templates` ADD CONSTRAINT `qc_templates_product_type_id_product_types_id_fk` FOREIGN KEY (`product_type_id`) REFERENCES `product_types`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `products_brand_model_idx` ON `products` (`brand`,`model`);--> statement-breakpoint
CREATE INDEX `products_type_idx` ON `products` (`product_type_id`);--> statement-breakpoint
CREATE INDEX `qc_template_items_template_idx` ON `qc_template_items` (`qc_template_id`);