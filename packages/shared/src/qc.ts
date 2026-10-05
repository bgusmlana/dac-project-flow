import { z } from 'zod';
import type { QcItemType, Stage } from './enums.js';

export const QC_RESULTS = ['pass', 'fail'] as const;
export type QcResult = (typeof QC_RESULTS)[number];

export const LOT_STATUSES = ['sampling', 'passed', 'on_hold', 'released', 'reworked'] as const;
export type LotStatus = (typeof LOT_STATUSES)[number];
export const LOT_STATUS_LABELS: Record<LotStatus, string> = {
  sampling: 'Sedang sampling',
  passed: 'Lulus',
  on_hold: 'Ditahan',
  released: 'Diloloskan (keputusan manager)',
  reworked: 'Dikembalikan (rework)',
};

export const inspectSchema = z.object({
  results: z.array(
    z.object({
      itemId: z.coerce.number().int().positive(),
      /** Untuk poin Lulus/Gagal. */
      passed: z.boolean().nullish().transform((v) => v ?? null),
      /** Untuk poin Angka / Catatan. */
      value: z
        .union([z.string(), z.number()])
        .nullish()
        .transform((v) => (v === null || v === undefined || v === '' ? null : String(v))),
    }),
  ),
  notes: z
    .string()
    .trim()
    .max(2000)
    .nullish()
    .transform((v) => (v ? v : null)),
  /** Tahap tujuan kalau hasilnya gagal (rework). Kosong = unit tetap di QC untuk diperiksa ulang. */
  reworkTo: z.enum(['assembling', 'activation']).nullish().transform((v) => v ?? null),
});
export type InspectInput = z.infer<typeof inspectSchema>;

export const lotDecisionSchema = z
  .object({
    action: z.enum(['release', 'rework']),
    reworkTo: z.enum(['assembling', 'activation']).nullish().transform((v) => v ?? null),
    note: z.string().trim().min(3, 'Alasan keputusan wajib diisi').max(1000),
  })
  .refine((v) => v.action !== 'rework' || v.reworkTo !== null, { message: 'Pilih tahap tujuan rework', path: ['reworkTo'] });

export interface QcFormItemDto {
  id: number;
  label: string;
  inputType: QcItemType;
  isRequired: boolean;
}

export interface QcInspectionDto {
  id: number;
  result: QcResult;
  templateVersion: number;
  lotCode: string | null;
  isSample: boolean;
  notes: string | null;
  inspectedByName: string | null;
  createdAt: string;
  results: { label: string; inputType: QcItemType; passed: boolean | null; value: string | null }[];
}

export interface QcFormDto {
  unitId: string;
  templateId: number | null;
  templateVersion: number | null;
  items: QcFormItemDto[];
  reworkTargets: Stage[];
  qcMode: 'per_unit' | 'sampling';
  /** Untuk mode sampling: lot unit ini & apakah unit ini sampel. */
  lot: { id: number; code: string; status: LotStatus } | null;
  isSample: boolean;
  history: QcInspectionDto[];
}

export interface LotSummaryDto {
  id: number;
  code: string;
  projectId: string;
  status: LotStatus;
  size: number;
  sampleSize: number;
  inspected: number;
  failed: number;
  maxSampleFail: number;
  decisionNote: string | null;
  createdAt: string;
}

export interface LotDetailDto extends LotSummaryDto {
  samples: { unitId: string; serialNumber: string; result: QcResult | null }[];
}

export interface InspectResultDto {
  result: QcResult;
  /** Status unit setelah inspeksi. */
  unitStatus: string;
  lot: LotSummaryDto | null;
}

// ---------------------------------------------------------------------------
// Foto / lampiran
// ---------------------------------------------------------------------------
export const ATTACHMENT_ENTITY_TYPES = ['unit', 'qc_inspection', 'lot', 'package', 'shipment', 'installation'] as const;
export type AttachmentEntityType = (typeof ATTACHMENT_ENTITY_TYPES)[number];

export interface AttachmentDto {
  id: string;
  entityType: AttachmentEntityType;
  entityId: string;
  category: string;
  originalName: string;
  url: string;
  thumbUrl: string;
  uploadedByName: string | null;
  createdAt: string;
}
