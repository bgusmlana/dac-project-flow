import { createCipheriv, createDecipheriv, hkdfSync } from 'node:crypto';
import { z } from 'zod';
import { env } from '../env.js';
import { notFound } from './errors.js';

/**
 * ID publik: ID angka di database (1, 2, 3, …) tidak pernah dikirim ke browser.
 * Yang dikirim adalah hasil enkripsi AES-256 dari (jenis data + ID), misalnya "q7HbC2x…" (22 karakter).
 * - Tidak bisa ditebak atau diurutkan tanpa kunci rahasia server (diturunkan dari APP_ENCRYPTION_KEY).
 * - ID project tidak bisa dipakai sebagai ID unit (jenis data ikut dienkripsi).
 * - Tidak perlu kolom tambahan di database.
 */
export const PUBLIC_KINDS = { project: 1, unit: 2, package: 3, shipment: 4, attachment: 5 } as const;
export type PublicKind = keyof typeof PUBLIC_KINDS;

const key = Buffer.from(hkdfSync('sha256', Buffer.from(env.APP_ENCRYPTION_KEY, 'hex'), 'manpro', 'public-id-v1', 32));
const MAGIC = Buffer.from('MNPRO\0\0', 'latin1'); // 7 byte penanda, memastikan hasil dekripsi valid

export function encodeId(kind: PublicKind, id: number): string {
  const block = Buffer.alloc(16);
  block[0] = PUBLIC_KINDS[kind];
  MAGIC.copy(block, 1);
  block.writeBigUInt64BE(BigInt(id), 8);
  const cipher = createCipheriv('aes-256-ecb', key, null).setAutoPadding(false);
  return Buffer.concat([cipher.update(block), cipher.final()]).toString('base64url');
}

/** ID angka dari ID publik, atau null kalau tidak valid / jenisnya lain. */
export function tryDecodeId(kind: PublicKind, publicId: string): number | null {
  if (!/^[A-Za-z0-9_-]{22}$/.test(publicId)) return null;
  const decipher = createDecipheriv('aes-256-ecb', key, null).setAutoPadding(false);
  const block = Buffer.concat([decipher.update(Buffer.from(publicId, 'base64url')), decipher.final()]);
  if (block[0] !== PUBLIC_KINDS[kind] || !block.subarray(1, 8).equals(MAGIC)) return null;
  const id = Number(block.readBigUInt64BE(8));
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

/** Seperti tryDecodeId, tapi ID tidak valid dianggap "data tidak ditemukan" (404). */
export function decodeId(kind: PublicKind, publicId: string): number {
  const id = tryDecodeId(kind, publicId);
  if (id === null) throw notFound();
  return id;
}

/** Versi untuk nilai yang boleh kosong. */
export const encodeIdOrNull = (kind: PublicKind, id: number | null | undefined) => (id === null || id === undefined ? null : encodeId(kind, id));
export const decodeIdOrNull = (kind: PublicKind, publicId: string | null | undefined) => (publicId ? decodeId(kind, publicId) : null);

/** Skema Zod untuk parameter URL berisi ID publik → angka. */
export const pid = (kind: PublicKind) => z.string().transform((s) => decodeId(kind, s));

/** Terjemahkan banyak ID publik sekaligus (misalnya daftar unit untuk proses massal). */
export const decodeIds = (kind: PublicKind, publicIds: string[]) => publicIds.map((s) => decodeId(kind, s));
