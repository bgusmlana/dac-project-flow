export const ROLES = ['super_admin', 'manager', 'leader', 'staff'] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  super_admin: 'Super Admin',
  manager: 'Manager',
  leader: 'Leader Divisi',
  staff: 'Staff',
};

/** Semakin besar angkanya, semakin tinggi role-nya. */
export const ROLE_LEVEL: Record<Role, number> = {
  super_admin: 4,
  manager: 3,
  leader: 2,
  staff: 1,
};

/** Role yang wajib terikat ke satu divisi. */
export const DIVISION_ROLES: readonly Role[] = ['leader', 'staff'];

export const STAGES = ['assembling', 'activation', 'qc', 'packing', 'shipping', 'installation'] as const;
export type Stage = (typeof STAGES)[number];

export const STAGE_LABELS: Record<Stage, string> = {
  assembling: 'Assembling',
  activation: 'Aktivasi',
  qc: 'QC',
  packing: 'Packing',
  shipping: 'Ekspedisi',
  installation: 'Instalasi',
};

export const DIVISION_CODES = ['ADMIN', 'ASSEMBLING', 'ACTIVATION', 'QC', 'PACKING', 'LOGISTICS'] as const;
export type DivisionCode = (typeof DIVISION_CODES)[number];

export const STAGE_REQUIREMENTS = ['required', 'optional', 'skipped'] as const;
export type StageRequirement = (typeof STAGE_REQUIREMENTS)[number];

export const STAGE_REQUIREMENT_LABELS: Record<StageRequirement, string> = {
  required: 'Wajib',
  optional: 'Opsional',
  skipped: 'Dilewati',
};

export const CLIENT_TYPES = ['dinas', 'instansi', 'swasta', 'lainnya'] as const;
export const CLIENT_TYPE_LABELS: Record<(typeof CLIENT_TYPES)[number], string> = {
  dinas: 'Dinas',
  instansi: 'Instansi',
  swasta: 'Swasta',
  lainnya: 'Lainnya',
};

export const VENDOR_TYPES = ['supplier', 'vendor', 'prinsipal'] as const;
export const VENDOR_TYPE_LABELS: Record<(typeof VENDOR_TYPES)[number], string> = {
  supplier: 'Supplier',
  vendor: 'Vendor',
  prinsipal: 'Prinsipal',
};

export const ACTIVATION_KINDS = ['os', 'software', 'other'] as const;
export const ACTIVATION_KIND_LABELS: Record<(typeof ACTIVATION_KINDS)[number], string> = {
  os: 'Sistem Operasi',
  software: 'Software',
  other: 'Lainnya',
};

export const CUSTOM_FIELD_TYPES = ['text', 'number', 'select', 'date', 'serial'] as const;
export type CustomFieldType = (typeof CUSTOM_FIELD_TYPES)[number];
export const CUSTOM_FIELD_TYPE_LABELS: Record<CustomFieldType, string> = {
  text: 'Teks',
  number: 'Angka',
  select: 'Pilihan',
  date: 'Tanggal',
  serial: 'Serial Number (bisa scan)',
};

export const QC_ITEM_TYPES = ['pass_fail', 'number', 'text'] as const;
export type QcItemType = (typeof QC_ITEM_TYPES)[number];
export const QC_ITEM_TYPE_LABELS: Record<QcItemType, string> = {
  pass_fail: 'Lulus / Gagal',
  number: 'Angka',
  text: 'Catatan',
};
