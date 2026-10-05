import {
  canManageProjects,
  canWorkStage,
  firstStatus,
  maskKey,
  type Actor,
  type ListUnitsQuery,
  type Paginated,
  type Stage,
  type UnitDetailDto,
  type UnitDto,
  type UnitStatus,
} from '@manpro/shared';
import { and, asc, count, desc, eq, inArray, like, sql, type SQL } from 'drizzle-orm';
import type { Db, DbOrTx } from '../db/index.js';
import {
  activations,
  activationTypes,
  clients,
  componentCategories,
  couriers,
  installations,
  packages,
  shipments,
  vendors,
  customFieldDefinitions,
  licenseKeys,
  productTypeActivationTypes,
  productTypeComponentCategories,
  software,
  unitComponents,
  projectItems,
  projects,
  secretAccessLogs,
  unitAccessories,
  units,
  unitStageLogs,
  users,
} from '../db/schema.js';
import { logActivity } from '../lib/audit.js';
import { decrypt, encrypt } from '../lib/crypto.js';
import { badRequest, forbidden, isDuplicateKeyError, notFound } from '../lib/errors.js';
import { adjustCounter } from './workflow.js';
import { encodeId, encodeIdOrNull } from '../lib/public-id.js';

type FieldDef = typeof customFieldDefinitions.$inferSelect;
type ItemRow = typeof projectItems.$inferSelect;

const itemLabel = (i: { brand: string; model: string }) => `${i.brand} ${i.model}`;

// ---------------------------------------------------------------------------
// Validasi kolom tambahan
// ---------------------------------------------------------------------------
async function fieldDefs(db: DbOrTx, productTypeId: number): Promise<FieldDef[]> {
  return db
    .select()
    .from(customFieldDefinitions)
    .where(eq(customFieldDefinitions.productTypeId, productTypeId))
    .orderBy(asc(customFieldDefinitions.sortOrder));
}

/** Validasi & normalisasi nilai kolom tambahan. Nilai rahasia dienkripsi. Melempar pesan error (string). */
function normalizeFields(defs: FieldDef[], input: Record<string, unknown>, existing: Record<string, string | number | null> = {}) {
  const out: Record<string, string | number | null> = { ...existing };
  for (const [key, raw] of Object.entries(input)) {
    const def = defs.find((d) => d.key === key);
    if (!def) throw `Kolom "${key}" tidak dikenal untuk jenis produk ini`;
    const str = raw === null || raw === undefined ? '' : String(raw).trim();
    if (str === '') {
      out[key] = null;
      continue;
    }
    if (def.inputType === 'number') {
      const n = Number(str.replace(',', '.'));
      if (Number.isNaN(n)) throw `${def.label} harus berupa angka`;
      out[key] = def.isSecret ? encrypt(String(n)) : n;
      continue;
    }
    if (def.inputType === 'select' && !(def.options ?? []).includes(str)) throw `${def.label} harus salah satu dari: ${(def.options ?? []).join(', ')}`;
    if (def.inputType === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(str)) throw `${def.label} harus berformat YYYY-MM-DD`;
    out[key] = def.isSecret ? encrypt(str) : str;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Tambah unit (manual & import)
// ---------------------------------------------------------------------------
export interface NewUnitRow {
  /** Nomor baris di file (untuk laporan error); untuk input manual = urutan. */
  row: number;
  serialNumber: string;
  customFields?: Record<string, unknown>;
  accessories?: { name: string; serialNumber: string | null }[];
}

export interface AddUnitsResult {
  inserted: number;
  errors: { row: number; message: string }[];
}

export async function getItem(db: DbOrTx, projectId: number, itemId: number): Promise<ItemRow> {
  const [item] = await db
    .select()
    .from(projectItems)
    .where(and(eq(projectItems.id, itemId), eq(projectItems.projectId, projectId)));
  if (!item) throw notFound('Item tidak ditemukan');
  return item;
}

/**
 * Tambah unit ke item dalam batch berisi maksimal 1.000 baris per transaksi.
 * Baris yang valid disimpan, baris yang tidak valid dilaporkan di `errors`.
 */
export async function addUnits(db: Db, actor: Actor, projectId: number, itemId: number, rows: NewUnitRow[], onProgress?: (done: number) => Promise<void>): Promise<AddUnitsResult> {
  const result: AddUnitsResult = { inserted: 0, errors: [] };
  const item = await getItem(db, projectId, itemId);
  const defs = await fieldDefs(db, item.productTypeId);
  const status: UnitStatus = firstStatus(item.stages);
  const seen = new Set<string>();

  for (let start = 0; start < rows.length; start += 1000) {
    const batch = rows.slice(start, start + 1000);
    const valid: { r: NewUnitRow; sn: string; fields: Record<string, string | number | null> }[] = [];

    for (const r of batch) {
      const sn = r.serialNumber.trim();
      if (!sn) {
        result.errors.push({ row: r.row, message: 'Serial number kosong' });
        continue;
      }
      if (sn.length > 100) {
        result.errors.push({ row: r.row, message: 'Serial number lebih dari 100 karakter' });
        continue;
      }
      const key = sn.toUpperCase();
      if (seen.has(key)) {
        result.errors.push({ row: r.row, message: `Serial number ${sn} ganda di data yang diinput` });
        continue;
      }
      seen.add(key);
      try {
        valid.push({ r, sn, fields: normalizeFields(defs, r.customFields ?? {}) });
      } catch (msg) {
        result.errors.push({ row: r.row, message: `${sn}: ${String(msg)}` });
      }
    }

    try {
      await db.transaction(async (tx) => {
        // Kunci item agar dua proses tidak melewati batas jumlah bersamaan.
        const [locked] = await tx.select({ quantity: projectItems.quantity }).from(projectItems).where(eq(projectItems.id, itemId)).for('update');
        const [{ n: existing } = { n: 0 }] = await tx.select({ n: count() }).from(units).where(eq(units.projectItemId, itemId));

        const dupRows = valid.length
          ? await tx.select({ sn: units.serialNumber }).from(units).where(inArray(units.serialNumber, valid.map((v) => v.sn)))
          : [];
        const dup = new Set(dupRows.map((d) => d.sn.toUpperCase()));
        let remaining = (locked?.quantity ?? 0) - existing;
        const toInsert: typeof valid = [];
        for (const v of valid) {
          if (dup.has(v.sn.toUpperCase())) result.errors.push({ row: v.r.row, message: `Serial number ${v.sn} sudah terdaftar` });
          else if (remaining <= 0) result.errors.push({ row: v.r.row, message: `${v.sn}: melebihi jumlah item (${locked?.quantity})` });
          else {
            toInsert.push(v);
            remaining--;
          }
        }
        if (toInsert.length === 0) return;

        await tx.insert(units).values(
          toInsert.map((v) => ({ projectId, projectItemId: itemId, serialNumber: v.sn, status, customFields: v.fields, createdBy: actor.id })),
        );
        const ids = await tx
          .select({ id: units.id, sn: units.serialNumber })
          .from(units)
          .where(inArray(units.serialNumber, toInsert.map((v) => v.sn)));
        const idBySn = new Map(ids.map((i) => [i.sn.toUpperCase(), i.id]));

        await tx.insert(unitStageLogs).values(
          toInsert.map((v) => ({ unitId: idBySn.get(v.sn.toUpperCase())!, fromStatus: null, toStatus: status, action: 'create', userId: actor.id })),
        );
        const accessoryRows = toInsert.flatMap((v) =>
          (v.r.accessories ?? []).map((a) => ({ unitId: idBySn.get(v.sn.toUpperCase())!, name: a.name, serialNumber: a.serialNumber, createdBy: actor.id })),
        );
        if (accessoryRows.length) await tx.insert(unitAccessories).values(accessoryRows);
        await adjustCounter(tx, projectId, status, toInsert.length);
        // Project otomatis "Berjalan" begitu unit pertama didaftarkan.
        await tx.update(projects).set({ status: 'in_progress' }).where(and(eq(projects.id, projectId), eq(projects.status, 'draft')));
        result.inserted += toInsert.length;
      });
    } catch (e) {
      if (!isDuplicateKeyError(e)) throw e;
      // Bentrok dengan data yang masuk bersamaan (atau SN kelengkapan ganda): tandai seluruh batch gagal.
      for (const v of valid) result.errors.push({ row: v.r.row, message: `${v.sn}: serial number (unit/kelengkapan) sudah terdaftar` });
    }
    await onProgress?.(Math.min(start + batch.length, rows.length));
  }

  if (result.inserted > 0) {
    await logActivity(db, {
      userId: actor.id,
      action: 'add_units',
      entityType: 'project',
      entityId: projectId,
      newValues: { itemId, inserted: result.inserted, failed: result.errors.length },
    });
  }
  return result;
}

// ---------------------------------------------------------------------------
// Baca
// ---------------------------------------------------------------------------
export async function listUnits(db: Db, projectId: number, q: ListUnitsQuery): Promise<Paginated<UnitDto>> {
  const filters: (SQL | undefined)[] = [eq(units.projectId, projectId)];
  if (q.status) filters.push(eq(units.status, q.status as UnitStatus));
  if (q.projectItemId) filters.push(eq(units.projectItemId, q.projectItemId));
  if (q.search) filters.push(like(units.serialNumber, `%${q.search}%`));
  const where = and(...filters);
  const [rows, [totalRow]] = await Promise.all([
    db
      .select({
        id: units.id,
        serialNumber: units.serialNumber,
        status: units.status,
        projectItemId: units.projectItemId,
        brand: projectItems.brand,
        model: projectItems.model,
        createdAt: units.createdAt,
      })
      .from(units)
      .innerJoin(projectItems, eq(units.projectItemId, projectItems.id))
      .where(where)
      .orderBy(desc(units.id))
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize),
    db.select({ total: count() }).from(units).where(where),
  ]);
  return {
    data: rows.map(({ brand, model, createdAt, ...r }) => ({ ...r, id: encodeId('unit', r.id), itemLabel: itemLabel({ brand, model }), createdAt: createdAt.toISOString() })),
    total: totalRow?.total ?? 0,
    page: q.page,
    pageSize: q.pageSize,
  };
}

async function unitRow(db: DbOrTx, id: number) {
  const [row] = await db
    .select({ unit: units, item: projectItems, projectCode: projects.code, projectName: projects.name })
    .from(units)
    .innerJoin(projectItems, eq(units.projectItemId, projectItems.id))
    .innerJoin(projects, eq(units.projectId, projects.id))
    .where(eq(units.id, id));
  if (!row) throw notFound('Unit tidak ditemukan');
  return row;
}

/** Data logistik unit: klien, vendor, koli, pengiriman, instalasi (untuk pelacakan garansi). */
async function unitLogistics(db: Db, unit: typeof units.$inferSelect, item: typeof projectItems.$inferSelect) {
  const [[client], [vendor], pkgRows, inst] = await Promise.all([
    db.select({ name: clients.name }).from(projects).innerJoin(clients, eq(projects.clientId, clients.id)).where(eq(projects.id, unit.projectId)),
    db.select({ name: vendors.name }).from(vendors).where(eq(vendors.id, item.vendorId)),
    unit.packageId
      ? db
          .select({
            id: packages.id,
            code: packages.code,
            status: packages.status,
            shipmentId: shipments.id,
            shipmentCode: shipments.code,
            shipmentStatus: shipments.status,
            courierName: couriers.name,
            trackingNumber: shipments.trackingNumber,
            shippedAt: shipments.shippedAt,
            receivedAt: shipments.receivedAt,
            receivedByName: shipments.receivedByName,
          })
          .from(packages)
          .leftJoin(shipments, eq(packages.shipmentId, shipments.id))
          .leftJoin(couriers, eq(shipments.courierId, couriers.id))
          .where(eq(packages.id, unit.packageId))
      : Promise.resolve([]),
    db
      .select({ id: installations.id, location: installations.location, notes: installations.notes, installedByName: users.name, createdAt: installations.createdAt })
      .from(installations)
      .leftJoin(users, eq(installations.installedBy, users.id))
      .where(eq(installations.unitId, unit.id))
      .orderBy(installations.id),
  ]);
  const p = pkgRows[0];
  return {
    clientName: client?.name ?? '',
    vendorName: vendor?.name ?? '',
    package: p ? { id: encodeId('package', p.id), code: p.code, status: p.status } : null,
    shipment:
      p?.shipmentId && p.shipmentCode && p.shipmentStatus
        ? {
            id: encodeId('shipment', p.shipmentId),
            code: p.shipmentCode,
            status: p.shipmentStatus,
            courierName: p.courierName,
            trackingNumber: p.trackingNumber,
            shippedAt: p.shippedAt?.toISOString() ?? null,
            receivedAt: p.receivedAt?.toISOString() ?? null,
            receivedByName: p.receivedByName,
          }
        : null,
    installations: inst.map((i) => ({ ...i, createdAt: i.createdAt.toISOString() })),
  };
}

export async function getUnit(db: Db, id: number): Promise<UnitDetailDto> {
  const { unit, item, projectCode, projectName } = await unitRow(db, id);
  const logistics = await unitLogistics(db, unit, item);
  const [defs, accessories, logs, components, categories, acts, actTypes] = await Promise.all([
    fieldDefs(db, item.productTypeId),
    db.select().from(unitAccessories).where(eq(unitAccessories.unitId, id)).orderBy(unitAccessories.id),
    db
      .select({
        id: unitStageLogs.id,
        fromStatus: unitStageLogs.fromStatus,
        toStatus: unitStageLogs.toStatus,
        action: unitStageLogs.action,
        note: unitStageLogs.note,
        userName: users.name,
        createdAt: unitStageLogs.createdAt,
      })
      .from(unitStageLogs)
      .leftJoin(users, eq(unitStageLogs.userId, users.id))
      .where(eq(unitStageLogs.unitId, id))
      .orderBy(desc(unitStageLogs.id)),
    db
      .select({
        id: unitComponents.id,
        componentCategoryId: unitComponents.componentCategoryId,
        categoryName: componentCategories.name,
        brand: unitComponents.brand,
        model: unitComponents.model,
        serialNumber: unitComponents.serialNumber,
        installedByName: users.name,
        createdAt: unitComponents.createdAt,
      })
      .from(unitComponents)
      .innerJoin(componentCategories, eq(unitComponents.componentCategoryId, componentCategories.id))
      .leftJoin(users, eq(unitComponents.installedBy, users.id))
      .where(eq(unitComponents.unitId, id))
      .orderBy(unitComponents.id),
    db
      .select({ id: componentCategories.id, name: componentCategories.name })
      .from(productTypeComponentCategories)
      .innerJoin(componentCategories, eq(productTypeComponentCategories.componentCategoryId, componentCategories.id))
      .where(and(eq(productTypeComponentCategories.productTypeId, item.productTypeId), eq(componentCategories.isActive, true)))
      .orderBy(componentCategories.name),
    db
      .select({
        id: activations.id,
        activationTypeId: activations.activationTypeId,
        softwareId: activations.softwareId,
        targetName: sql<string>`COALESCE(${activationTypes.name}, ${software.name})`,
        softwareVersion: activations.softwareVersion,
        licenseKeyId: activations.licenseKeyId,
        keyLast5: licenseKeys.keyLast5,
        result: activations.result,
        notes: activations.notes,
        performedByName: users.name,
        createdAt: activations.createdAt,
      })
      .from(activations)
      .leftJoin(activationTypes, eq(activations.activationTypeId, activationTypes.id))
      .leftJoin(software, eq(activations.softwareId, software.id))
      .leftJoin(licenseKeys, eq(activations.licenseKeyId, licenseKeys.id))
      .leftJoin(users, eq(activations.performedBy, users.id))
      .where(eq(activations.unitId, id))
      .orderBy(activations.id),
    db
      .select({ id: activationTypes.id, name: activationTypes.name, kind: activationTypes.kind })
      .from(productTypeActivationTypes)
      .innerJoin(activationTypes, eq(productTypeActivationTypes.activationTypeId, activationTypes.id))
      .where(and(eq(productTypeActivationTypes.productTypeId, item.productTypeId), eq(activationTypes.isActive, true)))
      .orderBy(activationTypes.name),
  ]);
  return {
    id: encodeId('unit', unit.id),
    serialNumber: unit.serialNumber,
    status: unit.status,
    projectItemId: unit.projectItemId,
    itemLabel: itemLabel(item),
    createdAt: unit.createdAt.toISOString(),
    projectId: encodeId('project', unit.projectId),
    projectCode,
    projectName,
    productTypeId: item.productTypeId,
    stages: item.stages,
    expectedAccessories: item.accessories,
    fields: defs.map((d) => {
      const v = unit.customFields[d.key] ?? null;
      return {
        key: d.key,
        label: d.label,
        inputType: d.inputType,
        options: d.options ?? null,
        isRequired: d.isRequired,
        isSecret: d.isSecret,
        value: d.isSecret ? null : v,
        hasValue: v !== null && v !== '',
      };
    }),
    accessories: accessories.map((a) => ({ id: a.id, name: a.name, serialNumber: a.serialNumber })),
    logs: logs.map((l) => ({ ...l, createdAt: l.createdAt.toISOString() })),
    components: components.map((c) => ({ ...c, createdAt: c.createdAt.toISOString() })),
    componentCategories: categories,
    activations: acts.map(({ keyLast5, createdAt, ...a }) => ({
      ...a,
      maskedKey: keyLast5 ? maskKey(keyLast5) : null,
      createdAt: createdAt.toISOString(),
    })),
    activationTypes: actTypes,
    ...logistics,
  };
}

/** Cari unit berdasarkan SN unit atau SN kelengkapan. */
export async function lookupUnit(db: Db, sn: string) {
  const value = sn.trim();
  const [direct] = await db.select({ id: units.id }).from(units).where(eq(units.serialNumber, value));
  if (direct) return getUnit(db, direct.id);
  const [acc] = await db.select({ unitId: unitAccessories.unitId }).from(unitAccessories).where(eq(unitAccessories.serialNumber, value));
  if (acc) return getUnit(db, acc.unitId);
  // SN komponen (misalnya klaim garansi SSD): cari unit tempat komponen itu terpasang.
  const [comp] = await db.select({ unitId: unitComponents.unitId }).from(unitComponents).where(eq(unitComponents.serialNumber, value));
  if (comp) return getUnit(db, comp.unitId);
  throw notFound(`Serial number ${value} tidak ditemukan`);
}

// ---------------------------------------------------------------------------
// Ubah
// ---------------------------------------------------------------------------
/** Admin project, atau divisi yang sedang memegang unit, boleh mengubah data unit. */
function ensureCanEditUnit(actor: Actor, status: UnitStatus) {
  if (canManageProjects(actor)) return;
  if (status !== 'completed' && canWorkStage(actor, status as Stage)) return;
  throw forbidden('Anda tidak boleh mengubah data unit ini');
}

export async function updateUnitFields(db: Db, actor: Actor, id: number, input: Record<string, unknown>, ip: string | null) {
  const { unit, item } = await unitRow(db, id);
  ensureCanEditUnit(actor, unit.status);
  const defs = await fieldDefs(db, item.productTypeId);
  let fields: Record<string, string | number | null>;
  try {
    fields = normalizeFields(defs, input, unit.customFields);
  } catch (msg) {
    throw badRequest(String(msg));
  }
  const secretKeys = new Set(defs.filter((d) => d.isSecret).map((d) => d.key));
  const redact = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, secretKeys.has(k) && v ? '[rahasia]' : v]));
  await db.transaction(async (tx) => {
    await tx.update(units).set({ customFields: fields }).where(eq(units.id, id));
    await logActivity(tx, {
      userId: actor.id,
      action: 'update_fields',
      entityType: 'unit',
      entityId: id,
      oldValues: redact(unit.customFields),
      newValues: redact(input),
      ipAddress: ip,
    });
  });
  return getUnit(db, id);
}

/** Buka nilai kolom rahasia; setiap akses dicatat. */
export async function revealUnitSecret(db: Db, actor: Actor, id: number, key: string, ip: string | null) {
  const { unit, item } = await unitRow(db, id);
  ensureCanEditUnit(actor, unit.status);
  const def = (await fieldDefs(db, item.productTypeId)).find((d) => d.key === key);
  if (!def?.isSecret) throw notFound('Kolom rahasia tidak ditemukan');
  const raw = unit.customFields[key];
  await db.insert(secretAccessLogs).values({ userId: actor.id, entityType: 'unit_field', entityId: String(id), field: key, action: 'view', ipAddress: ip });
  return { value: typeof raw === 'string' && raw ? decrypt(raw) : null };
}

export async function addAccessory(db: Db, actor: Actor, id: number, input: { name: string; serialNumber: string | null }, ip: string | null) {
  const { unit } = await unitRow(db, id);
  ensureCanEditUnit(actor, unit.status);
  try {
    await db.transaction(async (tx) => {
      const [res] = await tx.insert(unitAccessories).values({ unitId: id, ...input, createdBy: actor.id });
      await logActivity(tx, { userId: actor.id, action: 'add_accessory', entityType: 'unit', entityId: id, newValues: { accessoryId: res.insertId, ...input }, ipAddress: ip });
    });
  } catch (e) {
    if (isDuplicateKeyError(e)) throw badRequest(`Serial number ${input.serialNumber} sudah dipakai kelengkapan lain`);
    throw e;
  }
  return getUnit(db, id);
}

export async function removeAccessory(db: Db, actor: Actor, id: number, accessoryId: number, ip: string | null) {
  const { unit } = await unitRow(db, id);
  ensureCanEditUnit(actor, unit.status);
  const [acc] = await db
    .select()
    .from(unitAccessories)
    .where(and(eq(unitAccessories.id, accessoryId), eq(unitAccessories.unitId, id)));
  if (!acc) throw notFound('Kelengkapan tidak ditemukan');
  await db.transaction(async (tx) => {
    await tx.delete(unitAccessories).where(eq(unitAccessories.id, accessoryId));
    await logActivity(tx, { userId: actor.id, action: 'remove_accessory', entityType: 'unit', entityId: id, oldValues: acc, ipAddress: ip });
  });
  return getUnit(db, id);
}

/**
 * Hapus unit yang salah input. Hanya boleh selama unit belum dikerjakan (masih di tahap awal, belum pernah pindah).
 */
export async function deleteUnit(db: Db, actor: Actor, id: number, ip: string | null) {
  if (!canManageProjects(actor)) throw forbidden();
  const { unit, item } = await unitRow(db, id);
  const [{ n } = { n: 0 }] = await db.select({ n: count() }).from(unitStageLogs).where(eq(unitStageLogs.unitId, id));
  if (unit.status !== firstStatus(item.stages) || n > 1 || unit.packageId || unit.lotId) {
    throw badRequest('Unit sudah diproses sehingga tidak bisa dihapus');
  }
  await db.transaction(async (tx) => {
    await tx.delete(units).where(eq(units.id, id));
    await adjustCounter(tx, unit.projectId, unit.status, -1);
    await logActivity(tx, { userId: actor.id, action: 'delete', entityType: 'unit', entityId: id, oldValues: { serialNumber: unit.serialNumber, projectId: unit.projectId }, ipAddress: ip });
  });
}
