import { z } from 'zod';
import {
  ACTIVATION_KINDS,
  CLIENT_TYPES,
  CUSTOM_FIELD_TYPES,
  QC_ITEM_TYPES,
  STAGE_REQUIREMENTS,
  STAGES,
  VENDOR_TYPES,
  type CustomFieldType,
  type QcItemType,
  type Stage,
  type StageRequirement,
} from './enums.js';

const name = z.string().trim().min(1, 'Nama wajib diisi').max(150);
/** Teks opsional: string kosong dianggap null. */
const optText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));

// ---------------------------------------------------------------------------
// Master data sederhana (satu tabel, CRUD + nonaktif)
// ---------------------------------------------------------------------------
export const masterSchemas = {
  clients: z.object({
    name,
    type: z.enum(CLIENT_TYPES),
    address: optText(500),
    contactName: optText(100),
    phone: optText(30),
    email: optText(150),
  }),
  vendors: z.object({
    name,
    type: z.enum(VENDOR_TYPES),
    contactName: optText(100),
    phone: optText(30),
    email: optText(150),
  }),
  couriers: z.object({ name }),
  'component-categories': z.object({ name }),
  'activation-types': z.object({ name, kind: z.enum(ACTIVATION_KINDS) }),
  software: z.object({ name, publisher: optText(150) }),
} as const;

export type MasterKind = keyof typeof masterSchemas;
export const MASTER_KINDS = Object.keys(masterSchemas) as MasterKind[];
export type MasterInput<K extends MasterKind> = z.infer<(typeof masterSchemas)[K]>;

/** Baris master data yang dikirim API: field input + id & status aktif. */
export type MasterDto<K extends MasterKind = MasterKind> = MasterInput<K> & { id: number; isActive: boolean };

export const listMasterQuerySchema = z.object({
  search: z.string().trim().optional(),
  includeInactive: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(50),
});
export type ListMasterQuery = z.infer<typeof listMasterQuerySchema>;

// ---------------------------------------------------------------------------
// Katalog produk
// ---------------------------------------------------------------------------
export const productSchema = z.object({
  productTypeId: z.number().int().positive('Jenis produk wajib dipilih'),
  brand: z.string().trim().min(1, 'Merek wajib diisi').max(100),
  model: z.string().trim().min(1, 'Tipe wajib diisi').max(150),
  partNumber: optText(100),
  specification: optText(5000),
});
export type ProductInput = z.infer<typeof productSchema>;

export interface ProductDto extends ProductInput {
  id: number;
  productTypeName: string;
  isActive: boolean;
}

export const listProductsQuerySchema = listMasterQuerySchema.extend({
  productTypeId: z.coerce.number().int().positive().optional(),
});
export type ListProductsQuery = z.infer<typeof listProductsQuerySchema>;

// ---------------------------------------------------------------------------
// Jenis produk
// ---------------------------------------------------------------------------
const code = z
  .string()
  .trim()
  .toUpperCase()
  .min(2, 'Kode minimal 2 karakter')
  .max(20)
  .regex(/^[A-Z0-9_]+$/, 'Kode hanya huruf, angka, dan garis bawah');

export const createProductTypeSchema = z.object({ code, name });

export const updateProductTypeSchema = z.object({
  code,
  name,
  stages: z
    .array(z.object({ stage: z.enum(STAGES), requirement: z.enum(STAGE_REQUIREMENTS) }))
    .length(STAGES.length, 'Semua tahapan harus diatur')
    .refine((s) => new Set(s.map((x) => x.stage)).size === STAGES.length, 'Tahapan tidak boleh ganda')
    .refine(
      (s) => s.find((x) => x.stage === 'shipping')?.requirement === 'required',
      'Tahap Ekspedisi wajib untuk semua jenis produk',
    ),
  componentCategoryIds: z.array(z.number().int().positive()),
  activationTypeIds: z.array(z.number().int().positive()),
});
export type UpdateProductTypeInput = z.infer<typeof updateProductTypeSchema>;

export const customFieldSchema = z
  .object({
    key: z
      .string()
      .trim()
      .min(1, 'Kunci wajib diisi')
      .max(50)
      .regex(/^[a-z][a-z0-9_]*$/, 'Kunci hanya huruf kecil, angka, dan garis bawah, diawali huruf'),
    label: z.string().trim().min(1, 'Label wajib diisi').max(100),
    inputType: z.enum(CUSTOM_FIELD_TYPES),
    options: z.array(z.string().trim().min(1)).nullable().default(null),
    isRequired: z.boolean().default(false),
    isSecret: z.boolean().default(false),
  })
  .refine((f) => f.inputType !== 'select' || (f.options?.length ?? 0) > 0, {
    message: 'Kolom bertipe Pilihan wajib punya minimal satu opsi',
    path: ['options'],
  });

export const customFieldsSchema = z.object({
  fields: z
    .array(customFieldSchema)
    .refine((f) => new Set(f.map((x) => x.key)).size === f.length, 'Kunci kolom tidak boleh sama'),
});
export type CustomFieldInput = z.infer<typeof customFieldSchema>;

export const qcTemplateSchema = z.object({
  items: z
    .array(
      z.object({
        label: z.string().trim().min(1, 'Poin QC wajib diisi').max(200),
        inputType: z.enum(QC_ITEM_TYPES),
        isRequired: z.boolean().default(true),
      }),
    )
    .min(1, 'Template QC minimal punya satu poin'),
});
export type QcTemplateInput = z.infer<typeof qcTemplateSchema>;

export interface ProductTypeSummaryDto {
  id: number;
  code: string;
  name: string;
  isActive: boolean;
  stages: { stage: Stage; requirement: StageRequirement }[];
  productCount: number;
}

export interface CustomFieldDto {
  id: number;
  key: string;
  label: string;
  inputType: CustomFieldType;
  options: string[] | null;
  isRequired: boolean;
  isSecret: boolean;
}

export interface QcTemplateDto {
  id: number;
  version: number;
  items: { id: number; label: string; inputType: QcItemType; isRequired: boolean }[];
}

export interface ProductTypeDetailDto extends ProductTypeSummaryDto {
  componentCategoryIds: number[];
  activationTypeIds: number[];
  customFields: CustomFieldDto[];
  qcTemplate: QcTemplateDto | null;
}
