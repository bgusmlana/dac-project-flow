import {
  canManageProjects,
  canWorkStage,
  type Actor,
  type AttachmentDto,
  type AttachmentEntityType,
  type Stage,
} from '@manpro/shared';
import { and, desc, eq } from 'drizzle-orm';
import path from 'node:path';
import sharp from 'sharp';
import type { Db } from '../db/index.js';
import { attachments, lots, qcInspections, units, users } from '../db/schema.js';
import { logActivity } from '../lib/audit.js';
import { badRequest, forbidden, notFound } from '../lib/errors.js';
import { deleteFile, getFile, putFile } from '../lib/storage.js';
import { decodeId, encodeId, type PublicKind } from '../lib/public-id.js';

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const DOC_TYPES = new Set(['application/pdf']);

/** Divisi pemilik setiap jenis lampiran. */
const ENTITY_STAGE: Partial<Record<AttachmentEntityType, Stage>> = {
  qc_inspection: 'qc',
  lot: 'qc',
  package: 'packing',
  shipment: 'shipping',
  installation: 'installation',
};

function ensureCanAttach(actor: Actor, entityType: AttachmentEntityType) {
  const stage = ENTITY_STAGE[entityType];
  if (canManageProjects(actor)) return;
  if (stage && canWorkStage(actor, stage)) return;
  if (!stage) return; // foto unit umum: semua divisi boleh
  throw forbidden('Anda tidak boleh menambah dokumentasi di sini');
}

/** Teks label watermark untuk entitas (SN unit, kode lot, dll.). */
export type LabelResolver = (db: Db, id: number) => Promise<string | null>;
const labelResolvers: Partial<Record<AttachmentEntityType, LabelResolver>> = {
  unit: async (db, id) => (await db.select({ l: units.serialNumber }).from(units).where(eq(units.id, id)))[0]?.l ?? null,
  qc_inspection: async (db, id) =>
    (
      await db
        .select({ l: units.serialNumber })
        .from(qcInspections)
        .innerJoin(units, eq(qcInspections.unitId, units.id))
        .where(eq(qcInspections.id, id))
    )[0]?.l ?? null,
  installation: async (db, id) => (await db.select({ l: units.serialNumber }).from(units).where(eq(units.id, id)))[0]?.l ?? null,
  lot: async (db, id) => (await db.select({ l: lots.code }).from(lots).where(eq(lots.id, id)))[0]?.l ?? null,
};

/** Modul lain (packing, pengiriman) mendaftarkan cara membaca label entitasnya. */
export function registerAttachmentLabel(type: AttachmentEntityType, resolver: LabelResolver) {
  labelResolvers[type] = resolver;
}

function escapeXml(s: string) {
  return s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]!);
}

/** Watermark semi-transparan di bagian bawah foto. */
function watermarkSvg(width: number, text: string) {
  const fontSize = Math.max(14, Math.round(width / 45));
  const height = Math.round(fontSize * 2);
  return Buffer.from(
    `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">` +
      `<rect width="100%" height="100%" fill="black" fill-opacity="0.55"/>` +
      `<text x="${Math.round(fontSize / 2)}" y="${Math.round(fontSize * 1.35)}" font-family="Arial, sans-serif" font-size="${fontSize}" fill="white">${escapeXml(text)}</text>` +
      `</svg>`,
  );
}

/** Jenis ID publik untuk data yang dilampiri foto (lot & pemeriksaan QC tetap angka karena tidak tampil di alamat halaman). */
const ENTITY_KIND: Partial<Record<AttachmentEntityType, PublicKind>> = { unit: 'unit', installation: 'unit', package: 'package', shipment: 'shipment' };

export function encodeEntityId(type: AttachmentEntityType, id: number): string {
  const kind = ENTITY_KIND[type];
  return kind ? encodeId(kind, id) : String(id);
}

export function decodeEntityId(type: AttachmentEntityType, value: string): number {
  const kind = ENTITY_KIND[type];
  if (kind) return decodeId(kind, value);
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n <= 0) throw notFound('Data yang dilampiri tidak ditemukan');
  return n;
}

function toDto(a: typeof attachments.$inferSelect & { uploadedByName: string | null }): AttachmentDto {
  const id = encodeId('attachment', a.id);
  return {
    id,
    entityType: a.entityType as AttachmentEntityType,
    entityId: encodeEntityId(a.entityType as AttachmentEntityType, a.entityId),
    category: a.category,
    originalName: a.originalName,
    url: `/api/attachments/${id}/file`,
    thumbUrl: `/api/attachments/${id}/file?thumb=1`,
    uploadedByName: a.uploadedByName,
    createdAt: a.createdAt.toISOString(),
  };
}

export async function uploadAttachment(
  db: Db,
  actor: Actor,
  target: { entityType: AttachmentEntityType; entityId: number; category: string },
  file: { filename: string; mimetype: string; data: Buffer },
  ip: string | null,
): Promise<AttachmentDto> {
  ensureCanAttach(actor, target.entityType);
  const isImage = IMAGE_TYPES.has(file.mimetype);
  if (!isImage && !DOC_TYPES.has(file.mimetype)) throw badRequest('File harus foto (JPG/PNG/WEBP) atau PDF');
  const label = (await labelResolvers[target.entityType]?.(db, target.entityId)) ?? null;
  if (labelResolvers[target.entityType] && label === null) throw notFound('Data yang dilampiri tidak ditemukan');

  const [me] = await db.select({ name: users.name }).from(users).where(eq(users.id, actor.id));
  const now = new Date();
  const stamp = now.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', dateStyle: 'medium', timeStyle: 'short' });
  const base = `attachments/${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${crypto.randomUUID()}`;

  let storageKey: string;
  let thumbKey: string;
  let mimeType = file.mimetype;
  let size = file.data.length;
  if (isImage) {
    // File rusak / bukan gambar sungguhan / terlalu kecil → pesan jelas, bukan error server.
    const meta = await sharp(file.data)
      .metadata()
      .catch(() => null);
    if (!meta?.width || !meta.height) throw badRequest('File foto rusak atau tidak bisa dibaca');
    if (meta.width < 100 || meta.height < 100) throw badRequest('Foto terlalu kecil (minimal 100 × 100 piksel)');
    // Putar sesuai EXIF, perkecil maksimal 1600px, beri watermark, simpan JPEG.
    const resized = await sharp(file.data).rotate().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).toBuffer({ resolveWithObject: true });
    const text = [stamp, label, me?.name].filter(Boolean).join(' · ');
    const final = await sharp(resized.data).composite([{ input: watermarkSvg(resized.info.width, text), gravity: 'south' }]).jpeg({ quality: 80, mozjpeg: true }).toBuffer();
    const thumb = await sharp(final).resize({ width: 320, height: 320, fit: 'inside' }).jpeg({ quality: 70 }).toBuffer();
    storageKey = await putFile(`${base}.jpg`, final);
    thumbKey = await putFile(`${base}_t.jpg`, thumb);
    mimeType = 'image/jpeg';
    size = final.length;
  } else {
    storageKey = await putFile(`${base}${path.extname(file.filename).toLowerCase() || '.pdf'}`, file.data);
    thumbKey = storageKey;
  }

  const [res] = await db.insert(attachments).values({
    ...target,
    storageKey,
    thumbKey,
    originalName: file.filename.slice(0, 255),
    mimeType,
    sizeBytes: size,
    uploadedBy: actor.id,
  });
  await logActivity(db, { userId: actor.id, action: 'upload', entityType: target.entityType, entityId: target.entityId, newValues: { attachmentId: res.insertId, category: target.category }, ipAddress: ip });
  const [row] = await db.select().from(attachments).where(eq(attachments.id, res.insertId));
  return toDto({ ...row!, uploadedByName: me?.name ?? null });
}

export async function listAttachments(db: Db, entityType: AttachmentEntityType, entityId: number, category?: string): Promise<AttachmentDto[]> {
  const rows = await db
    .select({ a: attachments, uploadedByName: users.name })
    .from(attachments)
    .leftJoin(users, eq(attachments.uploadedBy, users.id))
    .where(
      and(
        eq(attachments.entityType, entityType),
        eq(attachments.entityId, entityId),
        category ? eq(attachments.category, category) : undefined,
      ),
    )
    .orderBy(desc(attachments.id));
  return rows.map((r) => toDto({ ...r.a, uploadedByName: r.uploadedByName }));
}

export async function readAttachment(db: Db, id: number, thumb: boolean) {
  const [a] = await db.select().from(attachments).where(eq(attachments.id, id));
  if (!a) throw notFound('File tidak ditemukan');
  const key = thumb ? a.thumbKey : a.storageKey;
  return { data: await getFile(key), mimeType: thumb && a.mimeType.startsWith('image/') ? 'image/jpeg' : a.mimeType, name: a.originalName };
}

export async function deleteAttachment(db: Db, actor: Actor, id: number, ip: string | null) {
  const [a] = await db.select().from(attachments).where(eq(attachments.id, id));
  if (!a) throw notFound('File tidak ditemukan');
  if (a.uploadedBy !== actor.id && actor.role !== 'super_admin' && actor.role !== 'manager') throw forbidden('Hanya pengunggah atau Manager yang boleh menghapus');
  await db.delete(attachments).where(eq(attachments.id, id));
  await deleteFile(a.storageKey);
  if (a.thumbKey !== a.storageKey) await deleteFile(a.thumbKey);
  await logActivity(db, { userId: actor.id, action: 'delete_attachment', entityType: a.entityType, entityId: a.entityId, oldValues: { attachmentId: id, name: a.originalName }, ipAddress: ip });
}
