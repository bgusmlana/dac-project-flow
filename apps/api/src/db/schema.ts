import {
  ACTIVATION_KINDS,
  ACTIVATION_RESULTS,
  CLIENT_TYPES,
  LICENSE_KEY_STATUSES,
  LOT_STATUSES,
  PACKAGE_STATUSES,
  QC_RESULTS,
  SHIPMENT_STATUSES,
  CUSTOM_FIELD_TYPES,
  IMPORT_STATUSES,
  PROJECT_STATUSES,
  QC_ITEM_TYPES,
  QC_MODES,
  ROLES,
  STAGE_REQUIREMENTS,
  STAGES,
  UNIT_STATUSES,
  VENDOR_TYPES,
  type DivisionCode,
  type Stage,
} from '@manpro/shared';
import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  char,
  date,
  datetime,
  decimal,
  foreignKey,
  index,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/mysql-core';

const timestamps = {
  createdAt: timestamp('created_at', { fsp: 3 }).notNull().default(sql`CURRENT_TIMESTAMP(3)`),
  updatedAt: timestamp('updated_at', { fsp: 3 })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP(3)`)
    .$onUpdate(() => new Date()),
};

// ---------------------------------------------------------------------------
// Divisi
// ---------------------------------------------------------------------------
export const divisions = mysqlTable('divisions', {
  id: int('id').autoincrement().primaryKey(),
  code: varchar('code', { length: 30 }).$type<DivisionCode>().notNull().unique(),
  name: varchar('name', { length: 100 }).notNull(),
  /** Tahap yang dikerjakan divisi ini. Null = Admin Project. */
  stage: mysqlEnum('stage', STAGES),
  ...timestamps,
});

// ---------------------------------------------------------------------------
// Tabel Better Auth (users, sessions, accounts, verifications)
// Nama properti (camelCase) harus sama dengan nama field Better Auth.
// ---------------------------------------------------------------------------
export const users = mysqlTable(
  'users',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    name: varchar('name', { length: 100 }).notNull(),
    /** Wajib di Better Auth. Untuk user tanpa email diisi otomatis `<username>@users.local`. */
    email: varchar('email', { length: 255 }).notNull().unique(),
    emailVerified: boolean('email_verified').notNull().default(false),
    image: text('image'),
    username: varchar('username', { length: 30 }).unique(),
    displayUsername: varchar('display_username', { length: 30 }),
    role: mysqlEnum('role', ROLES).notNull().default('staff'),
    divisionId: int('division_id').references(() => divisions.id),
    isActive: boolean('is_active').notNull().default(true),
    createdBy: varchar('created_by', { length: 36 }),
    ...timestamps,
  },
  (t) => [index('users_division_idx').on(t.divisionId)],
);

export const sessions = mysqlTable(
  'sessions',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    expiresAt: datetime('expires_at', { fsp: 3 }).notNull(),
    token: varchar('token', { length: 255 }).notNull().unique(),
    ipAddress: varchar('ip_address', { length: 64 }),
    userAgent: text('user_agent'),
    userId: varchar('user_id', { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    ...timestamps,
  },
  (t) => [index('sessions_user_idx').on(t.userId)],
);

export const accounts = mysqlTable(
  'accounts',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    accountId: varchar('account_id', { length: 255 }).notNull(),
    providerId: varchar('provider_id', { length: 50 }).notNull(),
    userId: varchar('user_id', { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: datetime('access_token_expires_at', { fsp: 3 }),
    refreshTokenExpiresAt: datetime('refresh_token_expires_at', { fsp: 3 }),
    scope: text('scope'),
    password: text('password'),
    ...timestamps,
  },
  (t) => [index('accounts_user_idx').on(t.userId)],
);

export const verifications = mysqlTable(
  'verifications',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    identifier: varchar('identifier', { length: 255 }).notNull(),
    value: text('value').notNull(),
    expiresAt: datetime('expires_at', { fsp: 3 }).notNull(),
    ...timestamps,
  },
  (t) => [index('verifications_identifier_idx').on(t.identifier)],
);

// ---------------------------------------------------------------------------
// Audit trail
// ---------------------------------------------------------------------------
export const activityLogs = mysqlTable(
  'activity_logs',
  {
    id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    userId: varchar('user_id', { length: 36 }),
    action: varchar('action', { length: 50 }).notNull(),
    entityType: varchar('entity_type', { length: 50 }).notNull(),
    entityId: varchar('entity_id', { length: 64 }).notNull(),
    oldValues: json('old_values'),
    newValues: json('new_values'),
    ipAddress: varchar('ip_address', { length: 64 }),
    createdAt: timestamp('created_at', { fsp: 3 }).notNull().default(sql`CURRENT_TIMESTAMP(3)`),
  },
  (t) => [
    index('activity_logs_entity_idx').on(t.entityType, t.entityId),
    index('activity_logs_user_idx').on(t.userId),
    index('activity_logs_created_idx').on(t.createdAt),
  ],
);

// ---------------------------------------------------------------------------
// Master data sederhana
// ---------------------------------------------------------------------------
const isActive = boolean('is_active').notNull().default(true);

export const clients = mysqlTable('clients', {
  id: int('id').autoincrement().primaryKey(),
  name: varchar('name', { length: 150 }).notNull().unique(),
  type: mysqlEnum('type', CLIENT_TYPES).notNull(),
  address: varchar('address', { length: 500 }),
  contactName: varchar('contact_name', { length: 100 }),
  phone: varchar('phone', { length: 30 }),
  email: varchar('email', { length: 150 }),
  isActive,
  ...timestamps,
});

export const vendors = mysqlTable('vendors', {
  id: int('id').autoincrement().primaryKey(),
  name: varchar('name', { length: 150 }).notNull().unique(),
  type: mysqlEnum('type', VENDOR_TYPES).notNull(),
  contactName: varchar('contact_name', { length: 100 }),
  phone: varchar('phone', { length: 30 }),
  email: varchar('email', { length: 150 }),
  isActive,
  ...timestamps,
});

export const couriers = mysqlTable('couriers', {
  id: int('id').autoincrement().primaryKey(),
  name: varchar('name', { length: 150 }).notNull().unique(),
  isActive,
  ...timestamps,
});

export const componentCategories = mysqlTable('component_categories', {
  id: int('id').autoincrement().primaryKey(),
  name: varchar('name', { length: 150 }).notNull().unique(),
  isActive,
  ...timestamps,
});

export const activationTypes = mysqlTable('activation_types', {
  id: int('id').autoincrement().primaryKey(),
  name: varchar('name', { length: 150 }).notNull().unique(),
  kind: mysqlEnum('kind', ACTIVATION_KINDS).notNull(),
  isActive,
  ...timestamps,
});

export const software = mysqlTable('software', {
  id: int('id').autoincrement().primaryKey(),
  name: varchar('name', { length: 150 }).notNull().unique(),
  publisher: varchar('publisher', { length: 150 }),
  isActive,
  ...timestamps,
});

// ---------------------------------------------------------------------------
// Jenis produk & konfigurasinya
// ---------------------------------------------------------------------------
export const productTypes = mysqlTable('product_types', {
  id: int('id').autoincrement().primaryKey(),
  code: varchar('code', { length: 20 }).notNull().unique(),
  name: varchar('name', { length: 150 }).notNull().unique(),
  isActive,
  ...timestamps,
});

export const productTypeStages = mysqlTable(
  'product_type_stages',
  {
    productTypeId: int('product_type_id')
      .notNull()
      .references(() => productTypes.id, { onDelete: 'cascade' }),
    stage: mysqlEnum('stage', STAGES).notNull(),
    requirement: mysqlEnum('requirement', STAGE_REQUIREMENTS).notNull(),
  },
  (t) => [primaryKey({ name: 'pts_pk', columns: [t.productTypeId, t.stage] })],
);

// Nama constraint ditulis manual karena nama otomatis melebihi batas 64 karakter MySQL.
export const productTypeComponentCategories = mysqlTable(
  'product_type_component_categories',
  {
    productTypeId: int('product_type_id').notNull(),
    componentCategoryId: int('component_category_id').notNull(),
  },
  (t) => [
    primaryKey({ name: 'ptcc_pk', columns: [t.productTypeId, t.componentCategoryId] }),
    foreignKey({ name: 'ptcc_product_type_fk', columns: [t.productTypeId], foreignColumns: [productTypes.id] }).onDelete('cascade'),
    foreignKey({ name: 'ptcc_component_category_fk', columns: [t.componentCategoryId], foreignColumns: [componentCategories.id] }),
  ],
);

export const productTypeActivationTypes = mysqlTable(
  'product_type_activation_types',
  {
    productTypeId: int('product_type_id').notNull(),
    activationTypeId: int('activation_type_id').notNull(),
  },
  (t) => [
    primaryKey({ name: 'ptat_pk', columns: [t.productTypeId, t.activationTypeId] }),
    foreignKey({ name: 'ptat_product_type_fk', columns: [t.productTypeId], foreignColumns: [productTypes.id] }).onDelete('cascade'),
    foreignKey({ name: 'ptat_activation_type_fk', columns: [t.activationTypeId], foreignColumns: [activationTypes.id] }),
  ],
);

export const customFieldDefinitions = mysqlTable(
  'custom_field_definitions',
  {
    id: int('id').autoincrement().primaryKey(),
    productTypeId: int('product_type_id')
      .notNull()
      .references(() => productTypes.id, { onDelete: 'cascade' }),
    key: varchar('key', { length: 50 }).notNull(),
    label: varchar('label', { length: 100 }).notNull(),
    inputType: mysqlEnum('input_type', CUSTOM_FIELD_TYPES).notNull(),
    options: json('options').$type<string[] | null>(),
    isRequired: boolean('is_required').notNull().default(false),
    isSecret: boolean('is_secret').notNull().default(false),
    sortOrder: int('sort_order').notNull().default(0),
    ...timestamps,
  },
  (t) => [uniqueIndex('custom_field_type_key_uq').on(t.productTypeId, t.key)],
);

/** Setiap kali template QC disimpan dibuat versi baru; versi lama tetap ada untuk riwayat inspeksi. */
export const qcTemplates = mysqlTable(
  'qc_templates',
  {
    id: int('id').autoincrement().primaryKey(),
    productTypeId: int('product_type_id')
      .notNull()
      .references(() => productTypes.id),
    version: int('version').notNull(),
    isActive,
    createdBy: varchar('created_by', { length: 36 }),
    createdAt: timestamps.createdAt,
  },
  (t) => [uniqueIndex('qc_template_type_version_uq').on(t.productTypeId, t.version)],
);

export const qcTemplateItems = mysqlTable(
  'qc_template_items',
  {
    id: int('id').autoincrement().primaryKey(),
    qcTemplateId: int('qc_template_id')
      .notNull()
      .references(() => qcTemplates.id, { onDelete: 'cascade' }),
    label: varchar('label', { length: 200 }).notNull(),
    inputType: mysqlEnum('input_type', QC_ITEM_TYPES).notNull(),
    isRequired: boolean('is_required').notNull().default(true),
    sortOrder: int('sort_order').notNull().default(0),
  },
  (t) => [index('qc_template_items_template_idx').on(t.qcTemplateId)],
);

// ---------------------------------------------------------------------------
// Katalog produk
// ---------------------------------------------------------------------------
export const products = mysqlTable(
  'products',
  {
    id: int('id').autoincrement().primaryKey(),
    productTypeId: int('product_type_id')
      .notNull()
      .references(() => productTypes.id),
    brand: varchar('brand', { length: 100 }).notNull(),
    model: varchar('model', { length: 150 }).notNull(),
    partNumber: varchar('part_number', { length: 100 }),
    specification: text('specification'),
    isActive,
    ...timestamps,
  },
  (t) => [
    uniqueIndex('products_brand_pn_uq').on(t.brand, t.partNumber),
    index('products_brand_model_idx').on(t.brand, t.model),
    index('products_type_idx').on(t.productTypeId),
  ],
);

// ---------------------------------------------------------------------------
// Project, item, unit
// ---------------------------------------------------------------------------
export const projects = mysqlTable(
  'projects',
  {
    id: int('id').autoincrement().primaryKey(),
    code: varchar('code', { length: 30 }).notNull().unique(),
    name: varchar('name', { length: 200 }).notNull(),
    clientId: int('client_id')
      .notNull()
      .references(() => clients.id),
    poNumber: varchar('po_number', { length: 100 }),
    targetDate: date('target_date', { mode: 'string' }),
    picUserId: varchar('pic_user_id', { length: 36 }).references(() => users.id),
    shippingAddress: text('shipping_address'),
    notes: text('notes'),
    status: mysqlEnum('status', PROJECT_STATUSES).notNull().default('draft'),
    qcMode: mysqlEnum('qc_mode', QC_MODES).notNull().default('per_unit'),
    lotSize: int('lot_size'),
    samplePercent: decimal('sample_percent', { precision: 5, scale: 2, mode: 'number' }),
    maxSampleFail: int('max_sample_fail'),
    createdBy: varchar('created_by', { length: 36 }),
    ...timestamps,
  },
  (t) => [index('projects_client_idx').on(t.clientId), index('projects_status_idx').on(t.status)],
);

export const projectItems = mysqlTable(
  'project_items',
  {
    id: int('id').autoincrement().primaryKey(),
    projectId: int('project_id')
      .notNull()
      .references(() => projects.id),
    productId: int('product_id')
      .notNull()
      .references(() => products.id),
    vendorId: int('vendor_id')
      .notNull()
      .references(() => vendors.id),
    // Salinan data produk saat item dibuat, supaya tidak berubah kalau katalog diedit.
    productTypeId: int('product_type_id')
      .notNull()
      .references(() => productTypes.id),
    brand: varchar('brand', { length: 100 }).notNull(),
    model: varchar('model', { length: 150 }).notNull(),
    partNumber: varchar('part_number', { length: 100 }),
    specification: text('specification'),
    quantity: int('quantity').notNull(),
    /** Urutan tahap yang dilalui unit item ini (hasil itemStages). */
    stages: json('stages').$type<Stage[]>().notNull(),
    /** Kelengkapan wajib per unit, dicek saat packing. */
    accessories: json('accessories').$type<string[]>().notNull(),
    ...timestamps,
  },
  (t) => [index('project_items_project_idx').on(t.projectId)],
);

export const units = mysqlTable(
  'units',
  {
    id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    projectId: int('project_id')
      .notNull()
      .references(() => projects.id),
    projectItemId: int('project_item_id')
      .notNull()
      .references(() => projectItems.id),
    lotId: int('lot_id'),
    packageId: int('package_id'),
    serialNumber: varchar('serial_number', { length: 100 }).notNull().unique(),
    status: mysqlEnum('status', UNIT_STATUSES).notNull(),
    /** Nilai kolom tambahan per jenis produk. Nilai rahasia disimpan terenkripsi. */
    customFields: json('custom_fields').$type<Record<string, string | number | null>>().notNull(),
    createdBy: varchar('created_by', { length: 36 }),
    ...timestamps,
  },
  (t) => [
    index('units_project_status_idx').on(t.projectId, t.status),
    index('units_item_idx').on(t.projectItemId),
    index('units_lot_idx').on(t.lotId),
    index('units_package_idx').on(t.packageId),
  ],
);

export const unitAccessories = mysqlTable(
  'unit_accessories',
  {
    id: int('id').autoincrement().primaryKey(),
    unitId: bigint('unit_id', { mode: 'number', unsigned: true })
      .notNull()
      .references(() => units.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 100 }).notNull(),
    serialNumber: varchar('serial_number', { length: 100 }).unique(),
    createdBy: varchar('created_by', { length: 36 }),
    createdAt: timestamps.createdAt,
  },
  (t) => [index('unit_accessories_unit_idx').on(t.unitId)],
);

export const unitStageLogs = mysqlTable(
  'unit_stage_logs',
  {
    id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    unitId: bigint('unit_id', { mode: 'number', unsigned: true })
      .notNull()
      .references(() => units.id, { onDelete: 'cascade' }),
    fromStatus: mysqlEnum('from_status', UNIT_STATUSES),
    toStatus: mysqlEnum('to_status', UNIT_STATUSES).notNull(),
    /** create, advance, rework, ... */
    action: varchar('action', { length: 30 }).notNull(),
    note: text('note'),
    userId: varchar('user_id', { length: 36 }),
    createdAt: timestamps.createdAt,
  },
  (t) => [
    index('unit_stage_logs_unit_idx').on(t.unitId),
    // Untuk halaman Riwayat Pekerjaan: filter rentang tanggal, per petugas.
    index('unit_stage_logs_created_idx').on(t.createdAt),
    index('unit_stage_logs_user_created_idx').on(t.userId, t.createdAt),
  ],
);

/** Komponen yang dipasang saat assembling. */
export const unitComponents = mysqlTable(
  'unit_components',
  {
    id: int('id').autoincrement().primaryKey(),
    unitId: bigint('unit_id', { mode: 'number', unsigned: true })
      .notNull()
      .references(() => units.id, { onDelete: 'cascade' }),
    componentCategoryId: int('component_category_id')
      .notNull()
      .references(() => componentCategories.id),
    brand: varchar('brand', { length: 100 }).notNull(),
    model: varchar('model', { length: 150 }).notNull(),
    serialNumber: varchar('serial_number', { length: 100 }).unique(),
    installedBy: varchar('installed_by', { length: 36 }),
    createdAt: timestamps.createdAt,
  },
  (t) => [index('unit_components_unit_idx').on(t.unitId)],
);

/** Stok license key. Key disimpan terenkripsi; key_hash untuk cek duplikat tanpa membuka enkripsi. */
export const licenseKeys = mysqlTable(
  'license_keys',
  {
    id: int('id').autoincrement().primaryKey(),
    activationTypeId: int('activation_type_id').references(() => activationTypes.id),
    softwareId: int('software_id').references(() => software.id),
    keyEncrypted: text('key_encrypted').notNull(),
    keyHash: char('key_hash', { length: 64 }).notNull().unique(),
    keyLast5: varchar('key_last5', { length: 5 }).notNull(),
    /** Dialokasikan ke project tertentu; null = stok umum. */
    projectId: int('project_id').references(() => projects.id),
    status: mysqlEnum('status', LICENSE_KEY_STATUSES).notNull().default('available'),
    validUntil: date('valid_until', { mode: 'string' }),
    createdBy: varchar('created_by', { length: 36 }),
    ...timestamps,
  },
  (t) => [
    index('license_keys_type_status_idx').on(t.activationTypeId, t.status, t.projectId),
    index('license_keys_sw_status_idx').on(t.softwareId, t.status, t.projectId),
    index('license_keys_last5_idx').on(t.keyLast5),
  ],
);

export const activations = mysqlTable(
  'activations',
  {
    id: int('id').autoincrement().primaryKey(),
    unitId: bigint('unit_id', { mode: 'number', unsigned: true })
      .notNull()
      .references(() => units.id, { onDelete: 'cascade' }),
    activationTypeId: int('activation_type_id').references(() => activationTypes.id),
    softwareId: int('software_id').references(() => software.id),
    softwareVersion: varchar('software_version', { length: 50 }),
    /** Satu key hanya untuk satu aktivasi. */
    licenseKeyId: int('license_key_id')
      .unique()
      .references(() => licenseKeys.id),
    result: mysqlEnum('result', ACTIVATION_RESULTS).notNull(),
    notes: text('notes'),
    performedBy: varchar('performed_by', { length: 36 }),
    createdAt: timestamps.createdAt,
  },
  (t) => [index('activations_unit_idx').on(t.unitId)],
);

/** Lot QC untuk project bermode sampling. */
export const lots = mysqlTable(
  'lots',
  {
    id: int('id').autoincrement().primaryKey(),
    projectId: int('project_id')
      .notNull()
      .references(() => projects.id),
    code: varchar('code', { length: 30 }).notNull(),
    status: mysqlEnum('status', LOT_STATUSES).notNull().default('sampling'),
    size: int('size').notNull(),
    sampleSize: int('sample_size').notNull(),
    maxSampleFail: int('max_sample_fail').notNull(),
    decisionNote: text('decision_note'),
    decidedBy: varchar('decided_by', { length: 36 }),
    createdBy: varchar('created_by', { length: 36 }),
    ...timestamps,
  },
  (t) => [uniqueIndex('lots_project_code_uq').on(t.projectId, t.code)],
);

export const lotSamples = mysqlTable(
  'lot_samples',
  {
    lotId: int('lot_id')
      .notNull()
      .references(() => lots.id, { onDelete: 'cascade' }),
    unitId: bigint('unit_id', { mode: 'number', unsigned: true })
      .notNull()
      .references(() => units.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ name: 'lot_samples_pk', columns: [t.lotId, t.unitId] })],
);

export const qcInspections = mysqlTable(
  'qc_inspections',
  {
    id: int('id').autoincrement().primaryKey(),
    unitId: bigint('unit_id', { mode: 'number', unsigned: true })
      .notNull()
      .references(() => units.id, { onDelete: 'cascade' }),
    lotId: int('lot_id').references(() => lots.id),
    qcTemplateId: int('qc_template_id')
      .notNull()
      .references(() => qcTemplates.id),
    result: mysqlEnum('result', QC_RESULTS).notNull(),
    /** Tahap tujuan rework kalau gagal (untuk sampel lot, dijalankan saat lot dievaluasi). */
    reworkTo: mysqlEnum('rework_to', ['assembling', 'activation']),
    notes: text('notes'),
    inspectedBy: varchar('inspected_by', { length: 36 }),
    createdAt: timestamps.createdAt,
  },
  (t) => [index('qc_inspections_unit_idx').on(t.unitId), index('qc_inspections_lot_idx').on(t.lotId)],
);

export const qcInspectionResults = mysqlTable(
  'qc_inspection_results',
  {
    id: int('id').autoincrement().primaryKey(),
    qcInspectionId: int('qc_inspection_id')
      .notNull()
      .references(() => qcInspections.id, { onDelete: 'cascade' }),
    qcTemplateItemId: int('qc_template_item_id').notNull(),
    passed: boolean('passed'),
    value: varchar('value', { length: 500 }),
  },
  (t) => [
    index('qc_results_inspection_idx').on(t.qcInspectionId),
    // Nama manual: nama otomatis melebihi 64 karakter.
    foreignKey({ name: 'qc_results_template_item_fk', columns: [t.qcTemplateItemId], foreignColumns: [qcTemplateItems.id] }),
  ],
);

/** Koli / dus. */
export const packages = mysqlTable(
  'packages',
  {
    id: int('id').autoincrement().primaryKey(),
    projectId: int('project_id')
      .notNull()
      .references(() => projects.id),
    code: varchar('code', { length: 50 }).notNull().unique(),
    status: mysqlEnum('status', PACKAGE_STATUSES).notNull().default('open'),
    weightKg: decimal('weight_kg', { precision: 10, scale: 2, mode: 'number' }),
    notes: text('notes'),
    shipmentId: int('shipment_id'),
    packedBy: varchar('packed_by', { length: 36 }),
    sealedAt: datetime('sealed_at', { fsp: 3 }),
    createdBy: varchar('created_by', { length: 36 }),
    ...timestamps,
  },
  (t) => [index('packages_project_idx').on(t.projectId), index('packages_shipment_idx').on(t.shipmentId)],
);

/** Pengiriman (satu surat jalan). */
export const shipments = mysqlTable(
  'shipments',
  {
    id: int('id').autoincrement().primaryKey(),
    projectId: int('project_id')
      .notNull()
      .references(() => projects.id),
    /** Nomor surat jalan. */
    code: varchar('code', { length: 50 }).notNull().unique(),
    status: mysqlEnum('status', SHIPMENT_STATUSES).notNull().default('preparing'),
    courierId: int('courier_id').references(() => couriers.id),
    trackingNumber: varchar('tracking_number', { length: 100 }),
    vehicleInfo: varchar('vehicle_info', { length: 100 }),
    notes: text('notes'),
    shippedAt: datetime('shipped_at', { fsp: 3 }),
    receivedAt: datetime('received_at', { fsp: 3 }),
    receivedByName: varchar('received_by_name', { length: 150 }),
    createdBy: varchar('created_by', { length: 36 }),
    ...timestamps,
  },
  (t) => [index('shipments_project_idx').on(t.projectId)],
);

export const installations = mysqlTable(
  'installations',
  {
    id: int('id').autoincrement().primaryKey(),
    unitId: bigint('unit_id', { mode: 'number', unsigned: true })
      .notNull()
      .references(() => units.id, { onDelete: 'cascade' }),
    location: varchar('location', { length: 300 }).notNull(),
    notes: text('notes'),
    installedBy: varchar('installed_by', { length: 36 }),
    createdAt: timestamps.createdAt,
  },
  (t) => [index('installations_unit_idx').on(t.unitId)],
);

/** Foto & dokumen untuk entitas apa pun (unit, inspeksi QC, koli, pengiriman, dll.). */
export const attachments = mysqlTable(
  'attachments',
  {
    id: int('id').autoincrement().primaryKey(),
    entityType: varchar('entity_type', { length: 30 }).notNull(),
    entityId: bigint('entity_id', { mode: 'number', unsigned: true }).notNull(),
    category: varchar('category', { length: 30 }).notNull(),
    storageKey: varchar('storage_key', { length: 255 }).notNull(),
    thumbKey: varchar('thumb_key', { length: 255 }).notNull(),
    originalName: varchar('original_name', { length: 255 }).notNull(),
    mimeType: varchar('mime_type', { length: 100 }).notNull(),
    sizeBytes: int('size_bytes').notNull(),
    uploadedBy: varchar('uploaded_by', { length: 36 }),
    createdAt: timestamps.createdAt,
  },
  (t) => [index('attachments_entity_idx').on(t.entityType, t.entityId)],
);

/** Jumlah unit per status per project; dijaga di transaksi yang sama dengan perubahan status. */
export const projectStageCounters = mysqlTable(
  'project_stage_counters',
  {
    projectId: int('project_id')
      .notNull()
      .references(() => projects.id),
    status: mysqlEnum('status', UNIT_STATUSES).notNull(),
    count: int('count').notNull().default(0),
  },
  (t) => [primaryKey({ name: 'psc_pk', columns: [t.projectId, t.status] })],
);

export const importJobs = mysqlTable(
  'import_jobs',
  {
    id: int('id').autoincrement().primaryKey(),
    type: varchar('type', { length: 30 }).notNull(),
    projectId: int('project_id'),
    projectItemId: int('project_item_id'),
    fileName: varchar('file_name', { length: 255 }).notNull(),
    filePath: varchar('file_path', { length: 500 }).notNull(),
    status: mysqlEnum('status', IMPORT_STATUSES).notNull().default('queued'),
    totalRows: int('total_rows').notNull().default(0),
    processedRows: int('processed_rows').notNull().default(0),
    successRows: int('success_rows').notNull().default(0),
    failedRows: int('failed_rows').notNull().default(0),
    /** Maksimal 1.000 error pertama. */
    errors: json('errors').$type<{ row: number; message: string }[]>().notNull(),
    message: text('message'),
    createdBy: varchar('created_by', { length: 36 }),
    ...timestamps,
  },
  (t) => [index('import_jobs_project_idx').on(t.projectId)],
);

/** Catatan setiap kali data rahasia (license key, password perangkat) dilihat atau disalin. */
export const secretAccessLogs = mysqlTable(
  'secret_access_logs',
  {
    id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    userId: varchar('user_id', { length: 36 }).notNull(),
    entityType: varchar('entity_type', { length: 30 }).notNull(),
    entityId: varchar('entity_id', { length: 64 }).notNull(),
    field: varchar('field', { length: 50 }),
    action: varchar('action', { length: 20 }).notNull(),
    ipAddress: varchar('ip_address', { length: 64 }),
    createdAt: timestamps.createdAt,
  },
  (t) => [index('secret_access_logs_entity_idx').on(t.entityType, t.entityId)],
);
