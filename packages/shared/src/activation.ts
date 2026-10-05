import { z } from 'zod';
import { optionalPublicIdSchema, publicIdSchema } from './schemas.js';
import type { Actor } from './permissions.js';

export const LICENSE_KEY_STATUSES = ['available', 'assigned', 'activated', 'failed', 'revoked'] as const;
export type LicenseKeyStatus = (typeof LICENSE_KEY_STATUSES)[number];
export const LICENSE_KEY_STATUS_LABELS: Record<LicenseKeyStatus, string> = {
  available: 'Tersedia',
  assigned: 'Dipakai',
  activated: 'Teraktivasi',
  failed: 'Gagal',
  revoked: 'Dicabut',
};

export const ACTIVATION_RESULTS = ['success', 'failed'] as const;
export type ActivationResult = (typeof ACTIVATION_RESULTS)[number];

/** Boleh melihat license key utuh & mengelola stok key (Super Admin, Manager, divisi Aktivasi)? */
export function canManageLicenseKeys(actor: Actor): boolean {
  return actor.role === 'super_admin' || actor.role === 'manager' || actor.divisionCode === 'ACTIVATION';
}

/** Tampilan key tersamar, misalnya "XXXXX-…-AB12C". */
export function maskKey(last5: string): string {
  return `XXXXX-XXXXX-XXXXX-XXXXX-${last5}`;
}

const target = {
  activationTypeId: z.coerce.number().int().positive().nullish().transform((v) => v ?? null),
  softwareId: z.coerce.number().int().positive().nullish().transform((v) => v ?? null),
};

function exactlyOne(v: { activationTypeId: number | null; softwareId: number | null }) {
  return (v.activationTypeId === null) !== (v.softwareId === null);
}
const oneMessage = { message: 'Pilih salah satu: jenis aktivasi atau software' };

export const importKeysSchema = z
  .object({
    ...target,
    projectId: publicIdSchema.nullish().transform((v) => v ?? null),
    validUntil: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullish()
      .or(z.literal(''))
      .transform((v) => (v ? v : null)),
    keys: z.array(z.string().trim().min(5, 'Key terlalu pendek').max(200)).min(1, 'Minimal satu key').max(50_000),
  })
  .refine(exactlyOne, oneMessage);
export type ImportKeysInput = z.infer<typeof importKeysSchema>;

export const allocateKeysSchema = z
  .object({
    ...target,
    /** null = kembalikan ke stok umum. */
    fromProjectId: publicIdSchema.nullish().transform((v) => v ?? null),
    toProjectId: publicIdSchema.nullish().transform((v) => v ?? null),
    count: z.coerce.number().int().min(1).max(50_000),
  })
  .refine(exactlyOne, oneMessage);

export const listKeysQuerySchema = z.object({
  activationTypeId: z.coerce.number().int().positive().optional(),
  softwareId: z.coerce.number().int().positive().optional(),
  projectId: optionalPublicIdSchema,
  status: z.enum(LICENSE_KEY_STATUSES).optional(),
  /** Cari berdasarkan 5 karakter terakhir atau SN unit. */
  search: z.string().trim().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});
export type ListKeysQuery = z.infer<typeof listKeysQuerySchema>;

export const addActivationSchema = z
  .object({
    ...target,
    softwareVersion: z
      .string()
      .trim()
      .max(50)
      .nullish()
      .transform((v) => (v ? v : null)),
    /** Ambil key otomatis dari stok (project ini dulu, lalu stok umum). */
    autoAssign: z.boolean().default(false),
    /** Key yang diketik/scan manual (misalnya key OEM yang tertempel di unit). */
    manualKey: z
      .string()
      .trim()
      .max(200)
      .nullish()
      .transform((v) => (v ? v : null)),
    /** Tanpa key (misalnya lisensi digital bawaan). */
    result: z.enum(ACTIVATION_RESULTS).default('success'),
    notes: z
      .string()
      .trim()
      .max(1000)
      .nullish()
      .transform((v) => (v ? v : null)),
  })
  .refine(exactlyOne, oneMessage)
  .refine((v) => !(v.autoAssign && v.manualKey), { message: 'Pilih salah satu: key otomatis atau key manual' });
export type AddActivationInput = z.infer<typeof addActivationSchema>;

export const bulkActivateSchema = z.object({
  unitIds: z.array(publicIdSchema).min(1).max(5000),
  activationTypeId: z.coerce.number().int().positive().nullish().transform((v) => v ?? null),
  softwareId: z.coerce.number().int().positive().nullish().transform((v) => v ?? null),
  softwareVersion: z.string().trim().max(50).nullish().transform((v) => (v ? v : null)),
  /** true = ambil key dari stok untuk setiap unit; false = aktivasi tanpa key (lisensi digital). */
  withKey: z.boolean().default(true),
  /** Setelah dicatat, langsung selesaikan tahap aktivasi. */
  complete: z.boolean().default(false),
});

export interface LicenseKeyDto {
  id: number;
  activationTypeId: number | null;
  softwareId: number | null;
  targetName: string;
  masked: string;
  status: LicenseKeyStatus;
  projectId: string | null;
  projectCode: string | null;
  unitId: string | null;
  unitSerialNumber: string | null;
  validUntil: string | null;
  createdAt: string;
}

export interface KeyStockDto {
  activationTypeId: number | null;
  softwareId: number | null;
  targetName: string;
  projectId: string | null;
  projectCode: string | null;
  counts: Partial<Record<LicenseKeyStatus, number>>;
}

export interface ActivationDto {
  id: number;
  activationTypeId: number | null;
  softwareId: number | null;
  targetName: string;
  softwareVersion: string | null;
  licenseKeyId: number | null;
  maskedKey: string | null;
  result: ActivationResult;
  notes: string | null;
  performedByName: string | null;
  createdAt: string;
}
