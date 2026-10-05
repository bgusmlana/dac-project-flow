import {
  canWorkStage,
  type Actor,
  type ShipmentDetailDto,
  type ShipmentStatus,
  type ShipmentSummaryDto,
} from '@manpro/shared';
import { and, count, desc, eq, inArray, like, sql } from 'drizzle-orm';
import type { Db, DbOrTx } from '../db/index.js';
import { clients, couriers, installations, packages, projects, shipments, units } from '../db/schema.js';
import { logActivity } from '../lib/audit.js';
import { badRequest, forbidden, notFound } from '../lib/errors.js';
import { registerAttachmentLabel } from './attachments.js';
import { advanceUnits } from './workflow.js';
import { encodeId, encodeIdOrNull } from '../lib/public-id.js';

registerAttachmentLabel('shipment', async (db, id) => (await db.select({ l: shipments.code }).from(shipments).where(eq(shipments.id, id)))[0]?.l ?? null);

function ensureLogistics(actor: Actor) {
  if (!canWorkStage(actor, 'shipping')) throw forbidden('Hanya divisi Logistik yang boleh mengelola pengiriman');
}

const summaryColumns = {
  id: shipments.id,
  code: shipments.code,
  projectId: shipments.projectId,
  projectCode: projects.code,
  projectName: projects.name,
  status: shipments.status,
  courierId: shipments.courierId,
  courierName: couriers.name,
  trackingNumber: shipments.trackingNumber,
  vehicleInfo: shipments.vehicleInfo,
  notes: shipments.notes,
  shippedAt: shipments.shippedAt,
  receivedAt: shipments.receivedAt,
  receivedByName: shipments.receivedByName,
  createdAt: shipments.createdAt,
  shippingAddress: projects.shippingAddress,
  clientName: clients.name,
};

function baseQuery(db: DbOrTx) {
  return db
    .select(summaryColumns)
    .from(shipments)
    .innerJoin(projects, eq(shipments.projectId, projects.id))
    .innerJoin(clients, eq(projects.clientId, clients.id))
    .leftJoin(couriers, eq(shipments.courierId, couriers.id));
}

async function totals(db: DbOrTx, shipmentIds: number[]) {
  if (shipmentIds.length === 0) return new Map<number, { packages: number; units: number }>();
  const rows = await db
    .select({ shipmentId: packages.shipmentId, packages: sql<number>`COUNT(DISTINCT ${packages.id})`, units: count(units.id) })
    .from(packages)
    .leftJoin(units, eq(units.packageId, packages.id))
    .where(inArray(packages.shipmentId, shipmentIds))
    .groupBy(packages.shipmentId);
  return new Map(rows.map((r) => [r.shipmentId!, { packages: Number(r.packages), units: r.units }]));
}

type Row = Awaited<ReturnType<ReturnType<typeof baseQuery>['where']>>[number];

function toSummary(r: Row, t: { packages: number; units: number } | undefined): ShipmentSummaryDto {
  return {
    id: encodeId('shipment', r.id),
    code: r.code,
    projectId: encodeId('project', r.projectId),
    projectCode: r.projectCode,
    projectName: r.projectName,
    status: r.status,
    courierName: r.courierName,
    trackingNumber: r.trackingNumber,
    packageCount: t?.packages ?? 0,
    unitCount: t?.units ?? 0,
    shippedAt: r.shippedAt?.toISOString() ?? null,
    receivedAt: r.receivedAt?.toISOString() ?? null,
    receivedByName: r.receivedByName,
    createdAt: r.createdAt.toISOString(),
  };
}

export async function listShipments(db: Db, filter: { projectId?: number; status?: ShipmentStatus }): Promise<ShipmentSummaryDto[]> {
  const rows = await baseQuery(db)
    .where(and(filter.projectId ? eq(shipments.projectId, filter.projectId) : undefined, filter.status ? eq(shipments.status, filter.status) : undefined))
    .orderBy(desc(shipments.id))
    .limit(200);
  const t = await totals(db, rows.map((r) => r.id));
  return rows.map((r) => toSummary(r, t.get(r.id)));
}

export async function getShipment(db: DbOrTx, id: number): Promise<ShipmentDetailDto> {
  const [r] = await baseQuery(db).where(eq(shipments.id, id));
  if (!r) throw notFound('Pengiriman tidak ditemukan');
  const pkgs = await db
    .select({ id: packages.id, code: packages.code, weightKg: packages.weightKg, unitCount: count(units.id) })
    .from(packages)
    .leftJoin(units, eq(units.packageId, packages.id))
    .where(eq(packages.shipmentId, id))
    .groupBy(packages.id, packages.code, packages.weightKg)
    .orderBy(packages.code);
  const t = { packages: pkgs.length, units: pkgs.reduce((a, p) => a + p.unitCount, 0) };
  return { ...toSummary(r, t), courierId: r.courierId, vehicleInfo: r.vehicleInfo, notes: r.notes, shippingAddress: r.shippingAddress, clientName: r.clientName, packages: pkgs.map((p) => ({ ...p, id: encodeId('package', p.id) })) };
}

async function lockShipment(tx: DbOrTx, id: number, expected: ShipmentStatus) {
  const [s] = await tx.select().from(shipments).where(eq(shipments.id, id)).for('update');
  if (!s) throw notFound('Pengiriman tidak ditemukan');
  if (s.status !== expected) throw badRequest(`Pengiriman ${s.code} berstatus ${s.status}, tidak bisa diproses`);
  return s;
}

export async function createShipment(db: Db, actor: Actor, projectId: number, ip: string | null) {
  ensureLogistics(actor);
  const [p] = await db.select({ code: projects.code }).from(projects).where(eq(projects.id, projectId));
  if (!p) throw notFound('Project tidak ditemukan');
  const id = await db.transaction(async (tx) => {
    // Nomor surat jalan: SJ-<kode project>-001
    const prefix = `SJ-${p.code}-`;
    const [last] = await tx.select({ code: shipments.code }).from(shipments).where(like(shipments.code, `${prefix}%`)).orderBy(desc(shipments.code)).limit(1).for('update');
    const code = prefix + String((last ? Number(last.code.slice(prefix.length)) : 0) + 1).padStart(3, '0');
    const [res] = await tx.insert(shipments).values({ projectId, code, createdBy: actor.id });
    await logActivity(tx, { userId: actor.id, action: 'create', entityType: 'shipment', entityId: res.insertId, newValues: { code }, ipAddress: ip });
    return res.insertId;
  });
  return getShipment(db, id);
}

/** Masukkan koli tersegel ke pengiriman (scan kode koli). */
export async function addPackages(db: Db, actor: Actor, shipmentId: number, codes: string[], ip: string | null) {
  ensureLogistics(actor);
  const errors: { code: string; message: string }[] = [];
  await db.transaction(async (tx) => {
    const s = await lockShipment(tx, shipmentId, 'preparing');
    const wanted = [...new Set(codes.map((c) => c.trim().toUpperCase()).filter(Boolean))];
    const rows = await tx.select().from(packages).where(inArray(packages.code, wanted)).for('update');
    const byCode = new Map(rows.map((r) => [r.code, r]));
    const ok: number[] = [];
    for (const code of wanted) {
      const p = byCode.get(code);
      if (!p) errors.push({ code, message: 'Koli tidak ditemukan' });
      else if (p.projectId !== s.projectId) errors.push({ code, message: 'Koli dari project lain' });
      else if (p.shipmentId === shipmentId) errors.push({ code, message: 'Sudah ada di pengiriman ini' });
      else if (p.shipmentId) errors.push({ code, message: 'Sudah masuk pengiriman lain' });
      else if (p.status !== 'sealed') errors.push({ code, message: 'Koli belum disegel' });
      else ok.push(p.id);
    }
    if (ok.length) {
      await tx.update(packages).set({ shipmentId }).where(inArray(packages.id, ok));
      await logActivity(tx, { userId: actor.id, action: 'add_packages', entityType: 'shipment', entityId: shipmentId, newValues: { packageIds: ok }, ipAddress: ip });
    }
  });
  return { errors, shipment: await getShipment(db, shipmentId) };
}

export async function removePackage(db: Db, actor: Actor, shipmentId: number, packageId: number, ip: string | null) {
  ensureLogistics(actor);
  await db.transaction(async (tx) => {
    await lockShipment(tx, shipmentId, 'preparing');
    const [p] = await tx.select({ shipmentId: packages.shipmentId }).from(packages).where(eq(packages.id, packageId));
    if (p?.shipmentId !== shipmentId) throw notFound('Koli tidak ada di pengiriman ini');
    await tx.update(packages).set({ shipmentId: null }).where(eq(packages.id, packageId));
    await logActivity(tx, { userId: actor.id, action: 'remove_package', entityType: 'shipment', entityId: shipmentId, oldValues: { packageId }, ipAddress: ip });
  });
  return getShipment(db, shipmentId);
}

/** Barang berangkat: catat ekspedisi & resi. */
export async function shipShipment(
  db: Db,
  actor: Actor,
  shipmentId: number,
  input: { courierId: number; trackingNumber: string | null; vehicleInfo: string | null; notes: string | null },
  ip: string | null,
) {
  ensureLogistics(actor);
  await db.transaction(async (tx) => {
    await lockShipment(tx, shipmentId, 'preparing');
    const [c] = await tx.select({ id: couriers.id }).from(couriers).where(eq(couriers.id, input.courierId));
    if (!c) throw badRequest('Ekspedisi tidak ditemukan');
    const [{ n } = { n: 0 }] = await tx.select({ n: count() }).from(packages).where(eq(packages.shipmentId, shipmentId));
    if (n === 0) throw badRequest('Belum ada koli di pengiriman ini');
    await tx.update(shipments).set({ ...input, status: 'shipped', shippedAt: new Date() }).where(eq(shipments.id, shipmentId));
    await tx.update(packages).set({ status: 'shipped' }).where(eq(packages.shipmentId, shipmentId));
    await logActivity(tx, { userId: actor.id, action: 'ship', entityType: 'shipment', entityId: shipmentId, newValues: input, ipAddress: ip });
  });
  return getShipment(db, shipmentId);
}

/** Barang diterima client (BAST): unit di dalamnya selesai tahap Pengiriman. */
export async function deliverShipment(
  db: Db,
  actor: Actor,
  shipmentId: number,
  input: { receivedByName: string; receivedAt: Date | null; notes: string | null },
  ip: string | null,
) {
  ensureLogistics(actor);
  await db.transaction(async (tx) => {
    const s = await lockShipment(tx, shipmentId, 'shipped');
    const pkgIds = (await tx.select({ id: packages.id }).from(packages).where(eq(packages.shipmentId, shipmentId))).map((p) => p.id);
    const unitIds = (await tx.select({ id: units.id }).from(units).where(inArray(units.packageId, pkgIds))).map((u) => u.id);
    if (unitIds.length) await advanceUnits(tx, actor, unitIds, 'shipping', `Diterima oleh ${input.receivedByName} (${s.code})`);
    await tx
      .update(shipments)
      .set({ status: 'delivered', receivedByName: input.receivedByName, receivedAt: input.receivedAt ?? new Date(), notes: input.notes ?? s.notes })
      .where(eq(shipments.id, shipmentId));
    await tx.update(packages).set({ status: 'delivered' }).where(eq(packages.shipmentId, shipmentId));
    await logActivity(tx, { userId: actor.id, action: 'deliver', entityType: 'shipment', entityId: shipmentId, newValues: input, ipAddress: ip });
  });
  return getShipment(db, shipmentId);
}

export async function deleteShipment(db: Db, actor: Actor, shipmentId: number, ip: string | null) {
  ensureLogistics(actor);
  await db.transaction(async (tx) => {
    const s = await lockShipment(tx, shipmentId, 'preparing');
    await tx.update(packages).set({ shipmentId: null }).where(eq(packages.shipmentId, shipmentId));
    await tx.delete(shipments).where(eq(shipments.id, shipmentId));
    await logActivity(tx, { userId: actor.id, action: 'delete', entityType: 'shipment', entityId: shipmentId, oldValues: { code: s.code }, ipAddress: ip });
  });
}

// ---------------------------------------------------------------------------
// Instalasi
// ---------------------------------------------------------------------------
export async function installUnits(
  db: Db,
  actor: Actor,
  input: { unitIds: number[]; serialNumbers: string[]; location: string; notes: string | null },
  ip: string | null,
) {
  if (!canWorkStage(actor, 'installation')) throw forbidden('Hanya divisi Logistik yang boleh mencatat instalasi');
  const ids = new Set(input.unitIds);
  if (input.serialNumbers.length) {
    const sns = [...new Set(input.serialNumbers)];
    const found = await db.select({ id: units.id, sn: units.serialNumber }).from(units).where(inArray(units.serialNumber, sns));
    const known = new Set(found.map((f) => f.sn.toUpperCase()));
    const missing = sns.filter((s) => !known.has(s.toUpperCase()));
    if (missing.length) throw badRequest(`Serial number tidak ditemukan: ${missing.slice(0, 5).join(', ')}`);
    for (const f of found) ids.add(f.id);
  }
  const unitIds = [...ids];
  const moved = await db.transaction(async (tx) => {
    const moves = await advanceUnits(tx, actor, unitIds, 'installation', `Terinstal di ${input.location}`);
    await tx.insert(installations).values(unitIds.map((unitId) => ({ unitId, location: input.location, notes: input.notes, installedBy: actor.id })));
    await logActivity(tx, { userId: actor.id, action: 'install', entityType: 'unit', entityId: unitIds.length === 1 ? unitIds[0]! : 'bulk', newValues: input, ipAddress: ip });
    return moves.length;
  });
  return { moved };
}
