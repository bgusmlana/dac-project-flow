import { z } from 'zod';
import { optionalPublicIdSchema, publicIdSchema } from './schemas.js';
import { STAGES, type Stage } from './enums.js';
import type { ActivationDto } from './activation.js';
import type { UnitStatus } from './workflow.js';

export const PROJECT_STATUSES = ['draft', 'in_progress', 'completed', 'cancelled'] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];
export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  draft: 'Draft',
  in_progress: 'Berjalan',
  completed: 'Selesai',
  cancelled: 'Dibatalkan',
};

export const QC_MODES = ['per_unit', 'sampling'] as const;
export type QcMode = (typeof QC_MODES)[number];
export const QC_MODE_LABELS: Record<QcMode, string> = {
  per_unit: 'Per unit (semua unit di-QC)',
  sampling: 'Sampling per lot',
};

const optText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));

const optInt = z.coerce.number().int().nullish().transform((v) => v ?? null);

export const projectSchema = z
  .object({
    name: z.string().trim().min(1, 'Nama project wajib diisi').max(200),
    clientId: z.coerce.number().int().positive('Client wajib dipilih'),
    poNumber: optText(100),
    targetDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal YYYY-MM-DD')
      .nullish()
      .or(z.literal(''))
      .transform((v) => (v ? v : null)),
    picUserId: optText(36),
    shippingAddress: optText(1000),
    notes: optText(5000),
    qcMode: z.enum(QC_MODES).default('per_unit'),
    lotSize: optInt,
    samplePercent: z.coerce.number().nullish().transform((v) => v ?? null),
    maxSampleFail: optInt,
  })
  .superRefine((p, ctx) => {
    if (p.qcMode !== 'sampling') return;
    if (!p.lotSize || p.lotSize < 1) ctx.addIssue({ code: 'custom', path: ['lotSize'], message: 'Ukuran lot wajib diisi untuk mode sampling' });
    if (!p.samplePercent || p.samplePercent <= 0 || p.samplePercent > 100)
      ctx.addIssue({ code: 'custom', path: ['samplePercent'], message: 'Persentase sampel harus 0–100' });
    if (p.maxSampleFail === null || p.maxSampleFail < 0)
      ctx.addIssue({ code: 'custom', path: ['maxSampleFail'], message: 'Batas sampel gagal wajib diisi' });
  });
export type ProjectInput = z.infer<typeof projectSchema>;

export const projectStatusSchema = z.object({ status: z.enum(PROJECT_STATUSES) });

export const listProjectsQuerySchema = z.object({
  search: z.string().trim().optional(),
  status: z.enum(PROJECT_STATUSES).optional(),
  clientId: z.coerce.number().int().positive().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type ListProjectsQuery = z.infer<typeof listProjectsQuerySchema>;

export const projectItemSchema = z.object({
  productId: z.coerce.number().int().positive('Produk wajib dipilih'),
  vendorId: z.coerce.number().int().positive('Vendor wajib dipilih'),
  quantity: z.coerce.number().int().min(1, 'Jumlah minimal 1').max(1_000_000),
  /** Tahap opsional (menurut jenis produk) yang dipakai di item ini. */
  optionalStages: z.array(z.enum(STAGES)).default([]),
  /** Kelengkapan yang wajib ada per unit (dicek saat packing), misalnya "Monitor". */
  accessories: z.array(z.string().trim().min(1).max(100)).default([]),
});
export type ProjectItemInput = z.infer<typeof projectItemSchema>;

const serialNumber = z.string().trim().min(1).max(100);

export const addUnitsSchema = z.object({
  serialNumbers: z.array(serialNumber).min(1, 'Minimal satu serial number').max(5000, 'Maksimal 5.000 per kali tambah; pakai import Excel untuk lebih banyak'),
});

export const updateUnitFieldsSchema = z.object({
  customFields: z.record(z.string(), z.union([z.string(), z.number(), z.null()])),
});

export const addAccessorySchema = z.object({
  name: z.string().trim().min(1, 'Nama kelengkapan wajib diisi').max(100),
  serialNumber: z
    .string()
    .trim()
    .max(100)
    .nullish()
    .transform((v) => (v ? v : null)),
});

export const listUnitsQuerySchema = z.object({
  search: z.string().trim().optional(),
  status: z.string().optional(),
  projectItemId: z.coerce.number().int().positive().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});
export type ListUnitsQuery = z.infer<typeof listUnitsQuerySchema>;

// ---------------------------------------------------------------------------
// DTO
// ---------------------------------------------------------------------------
export type StatusCounts = Partial<Record<UnitStatus, number>>;

export interface ProjectSummaryDto {
  id: string;
  code: string;
  name: string;
  clientId: number;
  clientName: string;
  poNumber: string | null;
  targetDate: string | null;
  status: ProjectStatus;
  totalQuantity: number;
  unitCount: number;
  counts: StatusCounts;
}

export interface ProjectItemDto {
  id: number;
  productId: number;
  productTypeId: number;
  productTypeName: string;
  brand: string;
  model: string;
  partNumber: string | null;
  specification: string | null;
  vendorId: number;
  vendorName: string;
  quantity: number;
  unitCount: number;
  stages: Stage[];
  accessories: string[];
}

export interface ProjectDetailDto extends ProjectSummaryDto {
  picUserId: string | null;
  picName: string | null;
  shippingAddress: string | null;
  notes: string | null;
  qcMode: QcMode;
  lotSize: number | null;
  samplePercent: number | null;
  maxSampleFail: number | null;
  items: ProjectItemDto[];
  createdAt: string;
}

export interface UnitDto {
  id: string;
  serialNumber: string;
  status: UnitStatus;
  projectItemId: number;
  itemLabel: string;
  createdAt: string;
}

export interface UnitFieldDto {
  key: string;
  label: string;
  inputType: string;
  options: string[] | null;
  isRequired: boolean;
  isSecret: boolean;
  /** Untuk kolom rahasia selalu null; pakai endpoint reveal. */
  value: string | number | null;
  hasValue: boolean;
}

export interface UnitLogDto {
  id: number;
  fromStatus: UnitStatus | null;
  toStatus: UnitStatus;
  action: string;
  note: string | null;
  userName: string | null;
  createdAt: string;
}

export interface UnitAccessoryDto {
  id: number;
  name: string;
  serialNumber: string | null;
}

export interface UnitDetailDto extends UnitDto {
  projectId: string;
  projectCode: string;
  projectName: string;
  productTypeId: number;
  stages: Stage[];
  fields: UnitFieldDto[];
  accessories: UnitAccessoryDto[];
  expectedAccessories: string[];
  components: UnitComponentDto[];
  /** Kategori komponen yang boleh dicatat untuk jenis produk ini. */
  componentCategories: { id: number; name: string }[];
  activations: ActivationDto[];
  /** Jenis aktivasi yang berlaku untuk jenis produk ini. */
  activationTypes: { id: number; name: string; kind: string }[];
  clientName: string;
  vendorName: string;
  package: { id: string; code: string; status: string } | null;
  shipment: {
    id: string;
    code: string;
    status: string;
    courierName: string | null;
    trackingNumber: string | null;
    shippedAt: string | null;
    receivedAt: string | null;
    receivedByName: string | null;
  } | null;
  installations: { id: number; location: string; notes: string | null; installedByName: string | null; createdAt: string }[];
  logs: UnitLogDto[];
}

export const IMPORT_STATUSES = ['queued', 'processing', 'done', 'failed'] as const;
export type ImportStatus = (typeof IMPORT_STATUSES)[number];

export interface ImportJobDto {
  id: number;
  type: string;
  fileName: string;
  status: ImportStatus;
  totalRows: number;
  processedRows: number;
  successRows: number;
  failedRows: number;
  errors: { row: number; message: string }[];
  message: string | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Lini produksi (antrian per tahap)
// ---------------------------------------------------------------------------
export const workQueueQuerySchema = z.object({
  projectId: optionalPublicIdSchema,
  search: z.string().trim().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});
export type WorkQueueQuery = z.infer<typeof workQueueQuerySchema>;

export interface WorkQueueItemDto {
  id: string;
  serialNumber: string;
  projectId: string;
  projectCode: string;
  itemLabel: string;
  /** Kapan unit masuk ke tahap ini. */
  since: string;
}

export interface WorkProjectDto {
  projectId: string;
  code: string;
  name: string;
  count: number;
}

export const unitIdsSchema = z.object({
  unitIds: z.array(publicIdSchema).min(1, 'Pilih minimal satu unit').max(5000),
  note: z
    .string()
    .trim()
    .max(1000)
    .nullish()
    .transform((v) => (v ? v : null)),
});

export const addComponentSchema = z.object({
  componentCategoryId: z.coerce.number().int().positive('Kategori wajib dipilih'),
  brand: z.string().trim().min(1, 'Merek wajib diisi').max(100),
  model: z.string().trim().min(1, 'Tipe wajib diisi').max(150),
  serialNumber: z
    .string()
    .trim()
    .max(100)
    .nullish()
    .transform((v) => (v ? v : null)),
});
export type AddComponentInput = z.infer<typeof addComponentSchema>;

export interface UnitComponentDto {
  id: number;
  componentCategoryId: number;
  categoryName: string;
  brand: string;
  model: string;
  serialNumber: string | null;
  installedByName: string | null;
  createdAt: string;
}
