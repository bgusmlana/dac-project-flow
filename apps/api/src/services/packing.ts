import {
  canWorkStage,
  type Actor,
  type PackageDetailDto,
  type PackageSummaryDto,
  type PackResultDto,
} from '@manpro/shared';
import { and, count, desc, eq, inArray, like } from 'drizzle-orm';
import type { Db, DbOrTx } from '../db/index.js';
import { packages, projectItems, projects, shipments, unitAccessories, units, users } from '../db/schema.js';
import { logActivity } from '../lib/audit.js';
import { badRequest, forbidden, notFound } from '../lib/errors.js';
import { registerAttachmentLabel } from './attachments.js';
import { advanceUnits, applyMoves } from './workflow.js';
import { encodeId, encodeIdOrNull } from '../lib/public-id.js';

registerAttachmentLabel('package', async (db, id) => (await db.select({ l: packages.code }).from(packages).where(eq(packages.id, id)))[0]?.l ?? null);

function ensurePacker(actor: Actor) {
  if (!canWorkStage(actor, 'packing')) throw forbidden('Hanya divisi Packing yang boleh mengelola koli');
}

const summaryColumns = {
  id: packages.id,
  code: packages.code,
  projectId: packages.projectId,
  projectCode: projects.code,
  status: packages.status,
  weightKg: packages.weightKg,
  shipmentId: packages.shipmentId,
  shipmentCode: shipments.code,
  packedByName: users.name,
  sealedAt: packages.sealedAt,
  createdAt: packages.createdAt,
  notes: packages.notes,
};

async function unitCounts(db: DbOrTx, ids: number[]) {
  if (ids.length === 0) return new Map<number, number>();
  const rows = await db.select({ packageId: units.packageId, n: count() }).from(units).where(inArray(units.packageId, ids)).groupBy(units.packageId);
  return new Map(rows.map((r) => [r.packageId!, r.n]));
}

type SummaryRow = { id: number; projectId: number; shipmentId: number | null; sealedAt: Date | null; createdAt: Date; notes: string | null } & Omit<
  PackageSummaryDto,
  'id' | 'projectId' | 'shipmentId' | 'sealedAt' | 'createdAt' | 'unitCount'
>;

function toSummary(r: SummaryRow, n: number): PackageSummaryDto {
  const { notes: _notes, ...rest } = r;
  return {
    ...rest,
    id: encodeId('package', r.id),
    projectId: encodeId('project', r.projectId),
    shipmentId: encodeIdOrNull('shipment', r.shipmentId),
    unitCount: n,
    sealedAt: r.sealedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
  };
}

function baseQuery(db: DbOrTx) {
  return db
    .select(summaryColumns)
    .from(packages)
    .innerJoin(projects, eq(packages.projectId, projects.id))
    .leftJoin(shipments, eq(packages.shipmentId, shipments.id))
    .leftJoin(users, eq(packages.packedBy, users.id));
}

export async function listPackages(db: Db, projectId: number, status?: string): Promise<PackageSummaryDto[]> {
  const rows = await baseQuery(db)
    .where(and(eq(packages.projectId, projectId), status ? eq(packages.status, status as PackageSummaryDto['status']) : undefined))
    .orderBy(desc(packages.id));
  const counts = await unitCounts(db, rows.map((r) => r.id));
  return rows.map((r) => toSummary(r, counts.get(r.id) ?? 0));
}

export async function getPackage(db: DbOrTx, id: number): Promise<PackageDetailDto> {
  const [row] = await baseQuery(db).where(eq(packages.id, id));
  if (!row) throw notFound('Koli tidak ditemukan');
  const unitRows = await db
    .select({ id: units.id, serialNumber: units.serialNumber, brand: projectItems.brand, model: projectItems.model })
    .from(units)
    .innerJoin(projectItems, eq(units.projectItemId, projectItems.id))
    .where(eq(units.packageId, id))
    .orderBy(units.serialNumber);
  const accs = unitRows.length
    ? await db.select().from(unitAccessories).where(inArray(unitAccessories.unitId, unitRows.map((u) => u.id)))
    : [];
  return {
    ...toSummary(row, unitRows.length),
    notes: row.notes,
    units: unitRows.map((u) => ({
      id: encodeId('unit', u.id),
      serialNumber: u.serialNumber,
      itemLabel: `${u.brand} ${u.model}`,
      accessories: accs.filter((a) => a.unitId === u.id).map((a) => ({ name: a.name, serialNumber: a.serialNumber })),
    })),
  };
}

export async function findPackageByCode(db: Db, code: string) {
  const [p] = await db.select({ id: packages.id }).from(packages).where(eq(packages.code, code.trim().toUpperCase()));
  if (!p) throw notFound(`Koli ${code} tidak ditemukan`);
  return getPackage(db, p.id);
}

export async function createPackage(db: Db, actor: Actor, projectId: number, ip: string | null): Promise<PackageDetailDto> {
  ensurePacker(actor);
  const [p] = await db.select({ code: projects.code, status: projects.status }).from(projects).where(eq(projects.id, projectId));
  if (!p) throw notFound('Project tidak ditemukan');
  if (p.status === 'completed' || p.status === 'cancelled') throw badRequest('Project sudah selesai atau dibatalkan');
  const id = await db.transaction(async (tx) => {
    // Kode koli: <kode project>-K0001, berurutan per project.
    const prefix = `${p.code}-K`;
    const [last] = await tx.select({ code: packages.code }).from(packages).where(like(packages.code, `${prefix}%`)).orderBy(desc(packages.code)).limit(1).for('update');
    const code = prefix + String((last ? Number(last.code.slice(prefix.length)) : 0) + 1).padStart(4, '0');
    const [res] = await tx.insert(packages).values({ projectId, code, packedBy: actor.id, createdBy: actor.id });
    await logActivity(tx, { userId: actor.id, action: 'create', entityType: 'package', entityId: res.insertId, newValues: { code }, ipAddress: ip });
    return res.insertId;
  });
  return getPackage(db, id);
}

async function openPackage(db: DbOrTx, id: number) {
  const [pkg] = await db.select().from(packages).where(eq(packages.id, id)).for('update');
  if (!pkg) throw notFound('Koli tidak ditemukan');
  if (pkg.status !== 'open') throw badRequest(`Koli ${pkg.code} sudah disegel`);
  return pkg;
}

/**
 * Masukkan unit ke koli lewat scan SN. Unit harus di tahap Packing, dari project yang sama,
 * belum masuk koli lain, dan kelengkapannya sudah lengkap.
 */
export async function packUnits(db: Db, actor: Actor, packageId: number, serialNumbers: string[], ip: string | null): Promise<PackResultDto> {
  ensurePacker(actor);
  const errors: PackResultDto['errors'] = [];
  const added = await db.transaction(async (tx) => {
    const pkg = await openPackage(tx, packageId);
    const sns = [...new Set(serialNumbers.map((s) => s.trim()).filter(Boolean))];
    const rows = await tx
      .select({ id: units.id, sn: units.serialNumber, status: units.status, projectId: units.projectId, packageId: units.packageId, expected: projectItems.accessories })
      .from(units)
      .innerJoin(projectItems, eq(units.projectItemId, projectItems.id))
      .where(inArray(units.serialNumber, sns))
      .for('update');
    const bySn = new Map(rows.map((r) => [r.sn.toUpperCase(), r]));
    const accs = rows.length ? await tx.select({ unitId: unitAccessories.unitId, name: unitAccessories.name }).from(unitAccessories).where(inArray(unitAccessories.unitId, rows.map((r) => r.id))) : [];

    const ok: number[] = [];
    for (const sn of sns) {
      const u = bySn.get(sn.toUpperCase());
      if (!u) errors.push({ serialNumber: sn, message: 'Serial number tidak ditemukan' });
      else if (u.projectId !== pkg.projectId) errors.push({ serialNumber: sn, message: 'Unit dari project lain' });
      else if (u.packageId === packageId) errors.push({ serialNumber: sn, message: 'Sudah ada di koli ini' });
      else if (u.packageId) errors.push({ serialNumber: sn, message: 'Sudah masuk koli lain' });
      else if (u.status !== 'packing') errors.push({ serialNumber: sn, message: `Unit belum/tidak di tahap Packing` });
      else {
        const have = new Set(accs.filter((a) => a.unitId === u.id).map((a) => a.name.toLowerCase()));
        const missing = u.expected.filter((e) => !have.has(e.toLowerCase()));
        if (missing.length) errors.push({ serialNumber: sn, message: `Kelengkapan belum lengkap: ${missing.join(', ')}` });
        else ok.push(u.id);
      }
    }
    if (ok.length) {
      await tx.update(units).set({ packageId }).where(inArray(units.id, ok));
      await logActivity(tx, { userId: actor.id, action: 'pack_units', entityType: 'package', entityId: packageId, newValues: { unitIds: ok }, ipAddress: ip });
    }
    return ok.length;
  });
  return { added, errors, package: await getPackage(db, packageId) };
}

export async function unpackUnit(db: Db, actor: Actor, packageId: number, unitId: number, ip: string | null) {
  ensurePacker(actor);
  await db.transaction(async (tx) => {
    await openPackage(tx, packageId);
    const [u] = await tx.select({ packageId: units.packageId }).from(units).where(eq(units.id, unitId));
    if (u?.packageId !== packageId) throw notFound('Unit tidak ada di koli ini');
    await tx.update(units).set({ packageId: null }).where(eq(units.id, unitId));
    await logActivity(tx, { userId: actor.id, action: 'unpack_unit', entityType: 'package', entityId: packageId, oldValues: { unitId }, ipAddress: ip });
  });
  return getPackage(db, packageId);
}

/** Segel koli: semua unit di dalamnya selesai packing → lanjut ke tahap Pengiriman. */
export async function sealPackage(db: Db, actor: Actor, packageId: number, input: { weightKg: number | null; notes: string | null }, ip: string | null) {
  ensurePacker(actor);
  await db.transaction(async (tx) => {
    const pkg = await openPackage(tx, packageId);
    const ids = (await tx.select({ id: units.id }).from(units).where(eq(units.packageId, packageId))).map((r) => r.id);
    if (ids.length === 0) throw badRequest('Koli masih kosong');
    await advanceUnits(tx, actor, ids, 'packing', `Masuk koli ${pkg.code}`);
    await tx.update(packages).set({ status: 'sealed', weightKg: input.weightKg, notes: input.notes, sealedAt: new Date(), packedBy: actor.id }).where(eq(packages.id, packageId));
    await logActivity(tx, { userId: actor.id, action: 'seal', entityType: 'package', entityId: packageId, newValues: { units: ids.length, ...input }, ipAddress: ip });
  });
  return getPackage(db, packageId);
}

/** Buka segel (salah packing). Hanya selama koli belum masuk pengiriman; unit kembali ke tahap Packing. */
export async function unsealPackage(db: Db, actor: Actor, packageId: number, ip: string | null) {
  ensurePacker(actor);
  await db.transaction(async (tx) => {
    const [pkg] = await tx.select().from(packages).where(eq(packages.id, packageId)).for('update');
    if (!pkg) throw notFound('Koli tidak ditemukan');
    if (pkg.status !== 'sealed' || pkg.shipmentId) throw badRequest('Hanya koli tersegel yang belum masuk pengiriman yang bisa dibuka');
    const rows = await tx.select({ id: units.id, projectId: units.projectId, status: units.status }).from(units).where(eq(units.packageId, packageId));
    const bad = rows.find((r) => r.status !== 'shipping');
    if (bad) throw badRequest('Ada unit di koli ini yang sudah diproses lebih lanjut');
    await applyMoves(tx, rows.map((r) => ({ id: r.id, projectId: r.projectId, from: r.status, to: 'packing' as const })), 'unseal', `Segel koli ${pkg.code} dibuka`, actor.id);
    await tx.update(packages).set({ status: 'open', sealedAt: null }).where(eq(packages.id, packageId));
    await logActivity(tx, { userId: actor.id, action: 'unseal', entityType: 'package', entityId: packageId, ipAddress: ip });
  });
  return getPackage(db, packageId);
}

/** Hapus koli kosong yang terbuka. */
export async function deletePackage(db: Db, actor: Actor, packageId: number, ip: string | null) {
  ensurePacker(actor);
  await db.transaction(async (tx) => {
    const pkg = await openPackage(tx, packageId);
    const [{ n } = { n: 0 }] = await tx.select({ n: count() }).from(units).where(eq(units.packageId, packageId));
    if (n > 0) throw badRequest('Koli masih berisi unit');
    await tx.delete(packages).where(eq(packages.id, packageId));
    await logActivity(tx, { userId: actor.id, action: 'delete', entityType: 'package', entityId: packageId, oldValues: { code: pkg.code }, ipAddress: ip });
  });
}
