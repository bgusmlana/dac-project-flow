import { z } from 'zod';
import { optionalPublicIdSchema, publicIdSchema } from './schemas.js';
import { STAGE_LABELS, STAGES, type Stage } from './enums.js';
import type { Actor } from './permissions.js';
import type { UnitStatus } from './workflow.js';

/** Jenis catatan riwayat pekerjaan unit (kolom `unit_stage_logs.action`). */
export const WORK_ACTIONS = ['advance', 'rework', 'qc_fail', 'create', 'unseal'] as const;
export type WorkAction = (typeof WORK_ACTIONS)[number];

export const WORK_ACTION_LABELS: Record<WorkAction, string> = {
  advance: 'Selesai / Lulus',
  rework: 'Dikembalikan (rework)',
  qc_fail: 'Gagal QC (cek ulang)',
  create: 'Didaftarkan',
  unseal: 'Segel koli dibuka',
};

/** Pilihan filter "Hasil" per tahap, dengan istilah yang dipakai divisi tersebut. */
export const STAGE_WORK_RESULTS: Record<Stage, { action: WorkAction; label: string }[]> = {
  assembling: [{ action: 'advance', label: 'Selesai Assembling' }],
  activation: [{ action: 'advance', label: 'Selesai Aktivasi' }],
  qc: [
    { action: 'advance', label: 'Lulus QC' },
    { action: 'rework', label: 'Gagal → dikembalikan (rework)' },
    { action: 'qc_fail', label: 'Gagal → cek ulang di QC' },
  ],
  packing: [{ action: 'advance', label: 'Koli disegel' }],
  shipping: [{ action: 'advance', label: 'Diterima client' }],
  installation: [{ action: 'advance', label: 'Selesai Instalasi' }],
};

/** Keterangan hasil satu catatan riwayat, misalnya "Lulus QC" atau "Gagal QC → Assembling". */
export function workResultLabel(action: string, from: UnitStatus | null, to: UnitStatus): string {
  const stage = (s: UnitStatus | null) => (s && s !== 'completed' ? STAGE_LABELS[s as Stage] : 'Selesai');
  switch (action) {
    case 'create':
      return 'Didaftarkan';
    case 'advance':
      return from === 'qc' ? 'Lulus QC' : `Selesai ${stage(from)}`;
    case 'rework':
      return from === 'qc' ? `Gagal QC → ${stage(to)}` : `Dikembalikan ke ${stage(to)}`;
    case 'qc_fail':
      return 'Gagal QC (cek ulang)';
    case 'unseal':
      return 'Segel koli dibuka';
    default:
      return action;
  }
}

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal YYYY-MM-DD');

const workHistoryFilterShape = {
  from: dateSchema.optional(),
  to: dateSchema.optional(),
  userId: z.string().min(1).optional(),
  divisionId: z.coerce.number().int().positive().optional(),
  projectId: optionalPublicIdSchema,
  /** active = hanya project yang masih berjalan (draft/berjalan). */
  projectStatus: z.enum(['active']).optional(),
  stage: z.enum(STAGES).optional(),
  action: z.enum(WORK_ACTIONS).optional(),
  search: z.string().trim().max(100).optional(),
};

export const workHistoryFilterSchema = z
  .object(workHistoryFilterShape)
  .refine((v) => !v.from || !v.to || v.from <= v.to, { message: 'Tanggal awal harus sebelum tanggal akhir', path: ['from'] });
export type WorkHistoryFilter = z.infer<typeof workHistoryFilterSchema>;

export const workHistoryQuerySchema = z
  .object({
    ...workHistoryFilterShape,
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(50),
  })
  .refine((v) => !v.from || !v.to || v.from <= v.to, { message: 'Tanggal awal harus sebelum tanggal akhir', path: ['from'] });
export type WorkHistoryQuery = z.infer<typeof workHistoryQuerySchema>;

export interface WorkHistoryItemDto {
  id: number;
  createdAt: string;
  unitId: string;
  serialNumber: string;
  projectId: string;
  projectCode: string;
  fromStatus: UnitStatus | null;
  toStatus: UnitStatus;
  action: string;
  note: string | null;
  userId: string | null;
  userName: string | null;
  divisionName: string | null;
}

/** Rekap jumlah pekerjaan per petugas per hari. */
export interface WorkSummaryRowDto {
  date: string;
  userId: string | null;
  userName: string | null;
  divisionName: string | null;
  advance: number;
  qcPass: number;
  rework: number;
  create: number;
  total: number;
}

export interface WorkSummaryDto {
  from: string;
  to: string;
  byDay: WorkSummaryRowDto[];
  /** Total per petugas untuk seluruh rentang tanggal, urut terbanyak. */
  byUser: Omit<WorkSummaryRowDto, 'date'>[];
}

export interface HistoryUserDto {
  id: string;
  name: string;
  divisionName: string | null;
}

/** Boleh membuka Log Aktivitas (semua perubahan data)? */
export function canViewActivityLogs(actor: Actor): boolean {
  return actor.role === 'super_admin' || actor.role === 'manager';
}

export const activityLogQuerySchema = z.object({
  from: dateSchema.optional(),
  to: dateSchema.optional(),
  userId: z.string().min(1).optional(),
  entityType: z.string().max(50).optional(),
  action: z.string().max(50).optional(),
  search: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});
export type ActivityLogQuery = z.infer<typeof activityLogQuerySchema>;

export interface ActivityLogDto {
  id: number;
  createdAt: string;
  userId: string | null;
  userName: string | null;
  action: string;
  entityType: string;
  entityId: string;
  oldValues: unknown;
  newValues: unknown;
  ipAddress: string | null;
}

export const ENTITY_TYPE_LABELS: Record<string, string> = {
  unit: 'Unit',
  project: 'Project',
  project_item: 'Item project',
  user: 'User',
  shipment: 'Pengiriman',
  package: 'Koli',
  product_type: 'Jenis produk',
  product: 'Katalog produk',
  license_key: 'License key',
  lot: 'Lot QC',
  qc_inspection: 'Pemeriksaan QC',
  client: 'Client',
  vendor: 'Vendor',
  component_category: 'Kategori komponen',
  activation_type: 'Jenis aktivasi',
  software: 'Software',
  courier: 'Ekspedisi',
  couriers: 'Ekspedisi',
  clients: 'Client',
  vendors: 'Vendor',
  component_categories: 'Kategori komponen',
  'component-categories': 'Kategori komponen',
  'activation-types': 'Jenis aktivasi',
  activation_types: 'Jenis aktivasi',
  installation: 'Instalasi',
  attachment: 'Foto / dokumen',
  import_job: 'Import Excel',
};

export const ACTIVITY_ACTION_LABELS: Record<string, string> = {
  create: 'Tambah',
  update: 'Ubah',
  delete: 'Hapus',
  activate: 'Aktifkan',
  deactivate: 'Nonaktifkan',
  key_available: 'Kembalikan key ke stok',
  key_revoked: 'Cabut key',
  lot_release: 'Loloskan lot QC',
  lot_rework: 'Kembalikan lot QC',
  set_status: 'Ubah status',
  upload: 'Unggah foto',
  delete_attachment: 'Hapus foto',
  update_profile: 'Ubah profil',
  change_password: 'Ganti password',
  reset_password: 'Reset password',
  add_item: 'Tambah item',
  update_item: 'Ubah item',
  delete_item: 'Hapus item',
  add_units: 'Tambah unit',
  update_fields: 'Ubah data tambahan',
  add_accessory: 'Tambah kelengkapan',
  remove_accessory: 'Hapus kelengkapan',
  add_component: 'Tambah komponen',
  remove_component: 'Hapus komponen',
  add_activation: 'Tambah aktivasi',
  remove_activation: 'Hapus aktivasi',
  bulk_activate: 'Aktivasi massal',
  import_keys: 'Import key',
  allocate_keys: 'Alokasi key',
  qc_inspect: 'Pemeriksaan QC',
  create_lot: 'Bentuk lot',
  pack_units: 'Masukkan unit ke koli',
  unpack_unit: 'Keluarkan unit dari koli',
  seal: 'Segel koli',
  unseal: 'Buka segel koli',
  add_packages: 'Tambah koli ke pengiriman',
  remove_package: 'Keluarkan koli dari pengiriman',
  ship: 'Kirim',
  deliver: 'Konfirmasi diterima',
  install: 'Instalasi',
  update_custom_fields: 'Ubah kolom tambahan',
  save_qc_template: 'Simpan checklist QC',
};
