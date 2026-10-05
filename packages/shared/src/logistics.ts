import { z } from 'zod';
import { optionalPublicIdSchema, publicIdSchema } from './schemas.js';

// ---------------------------------------------------------------------------
// Packing
// ---------------------------------------------------------------------------
export const PACKAGE_STATUSES = ['open', 'sealed', 'shipped', 'delivered'] as const;
export type PackageStatus = (typeof PACKAGE_STATUSES)[number];
export const PACKAGE_STATUS_LABELS: Record<PackageStatus, string> = {
  open: 'Terbuka',
  sealed: 'Tersegel',
  shipped: 'Dikirim',
  delivered: 'Diterima',
};

export const packUnitsSchema = z.object({
  serialNumbers: z.array(z.string().trim().min(1).max(100)).min(1).max(1000),
});

export const sealPackageSchema = z.object({
  weightKg: z.coerce.number().positive().max(100_000).nullish().transform((v) => v ?? null),
  notes: z.string().trim().max(1000).nullish().transform((v) => (v ? v : null)),
});

export interface PackageSummaryDto {
  id: string;
  code: string;
  projectId: string;
  projectCode: string;
  status: PackageStatus;
  unitCount: number;
  weightKg: number | null;
  shipmentId: string | null;
  shipmentCode: string | null;
  packedByName: string | null;
  sealedAt: string | null;
  createdAt: string;
}

export interface PackageDetailDto extends PackageSummaryDto {
  notes: string | null;
  units: { id: string; serialNumber: string; itemLabel: string; accessories: { name: string; serialNumber: string | null }[] }[];
}

export interface PackResultDto {
  added: number;
  errors: { serialNumber: string; message: string }[];
  package: PackageDetailDto;
}

// ---------------------------------------------------------------------------
// Pengiriman
// ---------------------------------------------------------------------------
export const SHIPMENT_STATUSES = ['preparing', 'shipped', 'delivered'] as const;
export type ShipmentStatus = (typeof SHIPMENT_STATUSES)[number];
export const SHIPMENT_STATUS_LABELS: Record<ShipmentStatus, string> = {
  preparing: 'Disiapkan',
  shipped: 'Dalam perjalanan',
  delivered: 'Diterima',
};

export const addPackagesSchema = z.object({
  codes: z.array(z.string().trim().min(1).max(50)).min(1).max(1000),
});

export const shipSchema = z.object({
  courierId: z.coerce.number().int().positive('Ekspedisi wajib dipilih'),
  trackingNumber: z.string().trim().max(100).nullish().transform((v) => (v ? v : null)),
  vehicleInfo: z.string().trim().max(100).nullish().transform((v) => (v ? v : null)),
  notes: z.string().trim().max(1000).nullish().transform((v) => (v ? v : null)),
});

export const deliverSchema = z.object({
  receivedByName: z.string().trim().min(1, 'Nama penerima wajib diisi').max(150),
  receivedAt: z
    .string()
    .datetime({ local: true, offset: true })
    .nullish()
    .transform((v) => (v ? new Date(v) : null)),
  notes: z.string().trim().max(1000).nullish().transform((v) => (v ? v : null)),
});

export interface ShipmentSummaryDto {
  id: string;
  code: string;
  projectId: string;
  projectCode: string;
  projectName: string;
  status: ShipmentStatus;
  courierName: string | null;
  trackingNumber: string | null;
  packageCount: number;
  unitCount: number;
  shippedAt: string | null;
  receivedAt: string | null;
  receivedByName: string | null;
  createdAt: string;
}

export interface ShipmentDetailDto extends ShipmentSummaryDto {
  courierId: number | null;
  vehicleInfo: string | null;
  notes: string | null;
  shippingAddress: string | null;
  clientName: string;
  packages: { id: string; code: string; unitCount: number; weightKg: number | null }[];
}

// ---------------------------------------------------------------------------
// Instalasi
// ---------------------------------------------------------------------------
export const installSchema = z
  .object({
    unitIds: z.array(publicIdSchema).max(5000).default([]),
    /** Alternatif unitIds: daftar SN hasil scan. */
    serialNumbers: z.array(z.string().trim().min(1).max(100)).max(5000).default([]),
    location: z.string().trim().min(1, 'Lokasi wajib diisi').max(300),
    notes: z.string().trim().max(1000).nullish().transform((v) => (v ? v : null)),
  })
  .refine((v) => v.unitIds.length + v.serialNumbers.length > 0, { message: 'Pilih minimal satu unit' });

export interface InstallationDto {
  id: number;
  location: string;
  notes: string | null;
  installedByName: string | null;
  createdAt: string;
}
