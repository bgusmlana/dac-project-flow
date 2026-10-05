import {
  canManageLicenseKeys,
  canWorkStage,
  maskKey,
  type Actor,
  type AddActivationInput,
  type ImportKeysInput,
  type KeyStockDto,
  type LicenseKeyDto,
  type LicenseKeyStatus,
  type ListKeysQuery,
  type Paginated,
} from '@manpro/shared';
import { and, count, desc, eq, inArray, isNull, like, or, sql, type SQL } from 'drizzle-orm';
import type { Db, DbOrTx } from '../db/index.js';
import {
  activations,
  activationTypes,
  licenseKeys,
  productTypeActivationTypes,
  projectItems,
  projects,
  secretAccessLogs,
  software,
  units,
} from '../db/schema.js';
import { logActivity } from '../lib/audit.js';
import { decrypt, encrypt, fingerprint } from '../lib/crypto.js';
import { encodeIdOrNull } from '../lib/public-id.js';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors.js';
import { getUnit } from './units.js';
import { advanceUnits } from './workflow.js';

type Target = { activationTypeId: number | null; softwareId: number | null };

function ensureKeyManager(actor: Actor) {
  if (!canManageLicenseKeys(actor)) throw forbidden('Hanya Super Admin, Manager, dan divisi Aktivasi yang boleh mengelola license key');
}

function ensureActivator(actor: Actor) {
  if (!canWorkStage(actor, 'activation')) throw forbidden('Hanya divisi Aktivasi yang boleh mencatat aktivasi');
}

const normalize = (key: string) => key.trim().toUpperCase();

function targetFilter(t: Target): SQL {
  return t.activationTypeId !== null ? eq(licenseKeys.activationTypeId, t.activationTypeId) : eq(licenseKeys.softwareId, t.softwareId!);
}

async function ensureTarget(db: DbOrTx, t: Target) {
  if (t.activationTypeId !== null) {
    const [row] = await db.select({ id: activationTypes.id }).from(activationTypes).where(eq(activationTypes.id, t.activationTypeId));
    if (!row) throw badRequest('Jenis aktivasi tidak ditemukan');
  } else {
    const [row] = await db.select({ id: software.id }).from(software).where(eq(software.id, t.softwareId!));
    if (!row) throw badRequest('Software tidak ditemukan');
  }
}

// ---------------------------------------------------------------------------
// Stok key
// ---------------------------------------------------------------------------
export async function importKeys(db: Db, actor: Actor, input: Omit<ImportKeysInput, 'projectId'> & { projectId: number | null }, ip: string | null) {
  ensureKeyManager(actor);
  await ensureTarget(db, input);
  if (input.projectId) {
    const [p] = await db.select({ id: projects.id }).from(projects).where(eq(projects.id, input.projectId));
    if (!p) throw badRequest('Project tidak ditemukan');
  }

  // Buang duplikat di dalam input (setelah dinormalisasi).
  const unique = new Map<string, string>();
  for (const k of input.keys) {
    const key = normalize(k);
    if (key) unique.set(fingerprint(key), key);
  }
  let inserted = 0;
  const duplicates: string[] = [];
  const entries = [...unique.entries()];
  for (let i = 0; i < entries.length; i += 1000) {
    const batch = entries.slice(i, i + 1000);
    const existing = await db.select({ h: licenseKeys.keyHash, last5: licenseKeys.keyLast5 }).from(licenseKeys).where(inArray(licenseKeys.keyHash, batch.map(([h]) => h)));
    const known = new Set(existing.map((e) => e.h));
    const fresh = batch.filter(([h, key]) => {
      if (!known.has(h)) return true;
      duplicates.push(maskKey(key.slice(-5)));
      return false;
    });
    if (fresh.length === 0) continue;
    await db.insert(licenseKeys).values(
      fresh.map(([h, key]) => ({
        activationTypeId: input.activationTypeId,
        softwareId: input.softwareId,
        keyEncrypted: encrypt(key),
        keyHash: h,
        keyLast5: key.slice(-5),
        projectId: input.projectId,
        validUntil: input.validUntil,
        createdBy: actor.id,
      })),
    );
    inserted += fresh.length;
  }
  await logActivity(db, {
    userId: actor.id,
    action: 'import_keys',
    entityType: 'license_key',
    entityId: input.activationTypeId ? `type:${input.activationTypeId}` : `software:${input.softwareId}`,
    newValues: { inserted, duplicates: duplicates.length, projectId: input.projectId },
    ipAddress: ip,
  });
  return { inserted, duplicates: duplicates.length, duplicateSamples: duplicates.slice(0, 20) };
}

const targetName = sql<string>`COALESCE(${activationTypes.name}, ${software.name})`;

export async function listKeys(db: Db, q: Omit<ListKeysQuery, 'projectId'> & { projectId?: number }): Promise<Paginated<LicenseKeyDto>> {
  const filters: (SQL | undefined)[] = [];
  if (q.activationTypeId) filters.push(eq(licenseKeys.activationTypeId, q.activationTypeId));
  if (q.softwareId) filters.push(eq(licenseKeys.softwareId, q.softwareId));
  if (q.projectId) filters.push(eq(licenseKeys.projectId, q.projectId));
  if (q.status) filters.push(eq(licenseKeys.status, q.status));
  if (q.search) filters.push(or(like(licenseKeys.keyLast5, `%${q.search.toUpperCase().slice(-5)}%`), eq(units.serialNumber, q.search)));
  const where = and(...filters);
  const base = () =>
    db
      .select({
        id: licenseKeys.id,
        activationTypeId: licenseKeys.activationTypeId,
        softwareId: licenseKeys.softwareId,
        targetName,
        last5: licenseKeys.keyLast5,
        status: licenseKeys.status,
        projectId: licenseKeys.projectId,
        projectCode: projects.code,
        unitId: units.id,
        unitSerialNumber: units.serialNumber,
        validUntil: licenseKeys.validUntil,
        createdAt: licenseKeys.createdAt,
      })
      .from(licenseKeys)
      .leftJoin(activationTypes, eq(licenseKeys.activationTypeId, activationTypes.id))
      .leftJoin(software, eq(licenseKeys.softwareId, software.id))
      .leftJoin(projects, eq(licenseKeys.projectId, projects.id))
      .leftJoin(activations, eq(activations.licenseKeyId, licenseKeys.id))
      .leftJoin(units, eq(activations.unitId, units.id));
  const [rows, [totalRow]] = await Promise.all([
    base().where(where).orderBy(desc(licenseKeys.id)).limit(q.pageSize).offset((q.page - 1) * q.pageSize),
    db
      .select({ total: count() })
      .from(licenseKeys)
      .leftJoin(activations, eq(activations.licenseKeyId, licenseKeys.id))
      .leftJoin(units, eq(activations.unitId, units.id))
      .where(where),
  ]);
  return {
    data: rows.map(({ last5, createdAt, ...r }) => ({
      ...r,
      projectId: encodeIdOrNull('project', r.projectId),
      unitId: encodeIdOrNull('unit', r.unitId),
      masked: maskKey(last5),
      createdAt: createdAt.toISOString(),
    })),
    total: totalRow?.total ?? 0,
    page: q.page,
    pageSize: q.pageSize,
  };
}

/** Jumlah key per jenis/software per project per status. */
export async function keyStock(db: Db): Promise<KeyStockDto[]> {
  const rows = await db
    .select({
      activationTypeId: licenseKeys.activationTypeId,
      softwareId: licenseKeys.softwareId,
      targetName,
      projectId: licenseKeys.projectId,
      projectCode: projects.code,
      status: licenseKeys.status,
      n: count(),
    })
    .from(licenseKeys)
    .leftJoin(activationTypes, eq(licenseKeys.activationTypeId, activationTypes.id))
    .leftJoin(software, eq(licenseKeys.softwareId, software.id))
    .leftJoin(projects, eq(licenseKeys.projectId, projects.id))
    .groupBy(licenseKeys.activationTypeId, licenseKeys.softwareId, licenseKeys.projectId, licenseKeys.status, activationTypes.name, software.name, projects.code);
  const map = new Map<string, KeyStockDto>();
  for (const r of rows) {
    const k = `${r.activationTypeId}|${r.softwareId}|${r.projectId}`;
    const entry = map.get(k) ?? {
      activationTypeId: r.activationTypeId,
      softwareId: r.softwareId,
      targetName: r.targetName,
      projectId: encodeIdOrNull('project', r.projectId),
      projectCode: r.projectCode,
      counts: {},
    };
    entry.counts[r.status] = r.n;
    map.set(k, entry);
  }
  return [...map.values()].sort((a, b) => a.targetName.localeCompare(b.targetName) || (a.projectCode ?? '').localeCompare(b.projectCode ?? ''));
}

/** Buka key utuh. Setiap akses dicatat. */
export async function revealKey(db: Db, actor: Actor, id: number, ip: string | null) {
  ensureKeyManager(actor);
  const [k] = await db.select({ enc: licenseKeys.keyEncrypted }).from(licenseKeys).where(eq(licenseKeys.id, id));
  if (!k) throw notFound('License key tidak ditemukan');
  await db.insert(secretAccessLogs).values({ userId: actor.id, entityType: 'license_key', entityId: String(id), action: 'view', ipAddress: ip });
  return { key: decrypt(k.enc) };
}

export async function setKeyStatus(db: Db, actor: Actor, id: number, status: 'revoked' | 'available', ip: string | null) {
  ensureKeyManager(actor);
  const [k] = await db.select().from(licenseKeys).where(eq(licenseKeys.id, id));
  if (!k) throw notFound('License key tidak ditemukan');
  const [used] = await db.select({ id: activations.id }).from(activations).where(eq(activations.licenseKeyId, id));
  if (used) throw badRequest('Key sedang dipakai unit; hapus dulu aktivasinya di unit tersebut');
  if (status === 'revoked' && k.status !== 'available' && k.status !== 'failed') throw badRequest('Hanya key tersedia/gagal yang bisa dicabut');
  if (status === 'available' && k.status !== 'revoked' && k.status !== 'failed') throw badRequest('Hanya key dicabut/gagal yang bisa dikembalikan ke stok');
  await db.transaction(async (tx) => {
    await tx.update(licenseKeys).set({ status }).where(eq(licenseKeys.id, id));
    await logActivity(tx, { userId: actor.id, action: `key_${status}`, entityType: 'license_key', entityId: id, oldValues: { status: k.status }, newValues: { status }, ipAddress: ip });
  });
}

/** Pindahkan sejumlah key tersedia antar project / stok umum. */
export async function allocateKeys(
  db: Db,
  actor: Actor,
  input: Target & { fromProjectId: number | null; toProjectId: number | null; count: number },
  ip: string | null,
) {
  ensureKeyManager(actor);
  if (input.fromProjectId === input.toProjectId) throw badRequest('Asal dan tujuan alokasi sama');
  const moved = await db.transaction(async (tx) => {
    const ids = await tx
      .select({ id: licenseKeys.id })
      .from(licenseKeys)
      .where(
        and(
          targetFilter(input),
          eq(licenseKeys.status, 'available'),
          input.fromProjectId === null ? isNull(licenseKeys.projectId) : eq(licenseKeys.projectId, input.fromProjectId),
        ),
      )
      .orderBy(licenseKeys.id)
      .limit(input.count)
      .for('update');
    if (ids.length < input.count) throw badRequest(`Key tersedia hanya ${ids.length}`);
    for (let i = 0; i < ids.length; i += 1000) {
      await tx.update(licenseKeys).set({ projectId: input.toProjectId }).where(inArray(licenseKeys.id, ids.slice(i, i + 1000).map((r) => r.id)));
    }
    await logActivity(tx, { userId: actor.id, action: 'allocate_keys', entityType: 'license_key', entityId: 'bulk', newValues: input, ipAddress: ip });
    return ids.length;
  });
  return { moved };
}

/**
 * Ambil `n` key tersedia: yang dialokasikan ke project ini dulu, lalu stok umum.
 * SKIP LOCKED supaya dua petugas yang bekerja bersamaan tidak mendapat key yang sama.
 */
async function pickKeys(tx: DbOrTx, t: Target, projectId: number, n: number) {
  const rows = await tx
    .select({ id: licenseKeys.id, last5: licenseKeys.keyLast5 })
    .from(licenseKeys)
    .where(and(targetFilter(t), eq(licenseKeys.status, 'available'), or(eq(licenseKeys.projectId, projectId), isNull(licenseKeys.projectId))))
    .orderBy(sql`${licenseKeys.projectId} IS NULL`, licenseKeys.id)
    .limit(n)
    .for('update', { skipLocked: true });
  if (rows.length < n) throw badRequest(n === 1 ? 'Stok license key habis untuk jenis ini' : `Stok license key hanya ${rows.length}, dibutuhkan ${n}`);
  return rows;
}

// ---------------------------------------------------------------------------
// Aktivasi per unit
// ---------------------------------------------------------------------------
async function unitForActivation(db: DbOrTx, unitId: number) {
  const [row] = await db
    .select({ id: units.id, status: units.status, projectId: units.projectId, productTypeId: projectItems.productTypeId })
    .from(units)
    .innerJoin(projectItems, eq(units.projectItemId, projectItems.id))
    .where(eq(units.id, unitId));
  if (!row) throw notFound('Unit tidak ditemukan');
  if (row.status !== 'activation') throw badRequest('Unit tidak sedang di tahap Aktivasi');
  return row;
}

async function ensureTypeAllowed(db: DbOrTx, productTypeId: number, t: Target) {
  if (t.activationTypeId === null) return;
  const [ok] = await db
    .select()
    .from(productTypeActivationTypes)
    .where(and(eq(productTypeActivationTypes.productTypeId, productTypeId), eq(productTypeActivationTypes.activationTypeId, t.activationTypeId)));
  if (!ok) throw badRequest('Jenis aktivasi ini tidak berlaku untuk jenis produk unit');
}

export async function addActivation(db: Db, actor: Actor, unitId: number, input: AddActivationInput, ip: string | null) {
  ensureActivator(actor);
  const unit = await unitForActivation(db, unitId);
  await ensureTarget(db, input);
  await ensureTypeAllowed(db, unit.productTypeId, input);

  await db.transaction(async (tx) => {
    let keyId: number | null = null;
    if (input.autoAssign) {
      keyId = (await pickKeys(tx, input, unit.projectId, 1))[0]!.id;
    } else if (input.manualKey) {
      const key = normalize(input.manualKey);
      const h = fingerprint(key);
      const [existing] = await tx.select().from(licenseKeys).where(eq(licenseKeys.keyHash, h)).for('update');
      if (existing) {
        if (existing.status !== 'available') throw conflict(`Key ${maskKey(existing.keyLast5)} sudah ${existing.status === 'revoked' ? 'dicabut' : 'dipakai'}`);
        if (existing.activationTypeId !== input.activationTypeId || existing.softwareId !== input.softwareId) {
          throw badRequest('Key ini terdaftar untuk jenis aktivasi/software lain');
        }
        keyId = existing.id;
      } else {
        // Key baru yang belum ada di stok (misalnya stiker OEM di unit) langsung didaftarkan.
        const [res] = await tx.insert(licenseKeys).values({
          activationTypeId: input.activationTypeId,
          softwareId: input.softwareId,
          keyEncrypted: encrypt(key),
          keyHash: h,
          keyLast5: key.slice(-5),
          projectId: unit.projectId,
          status: 'assigned',
          createdBy: actor.id,
        });
        keyId = res.insertId;
      }
    }
    if (keyId !== null) {
      const status: LicenseKeyStatus = input.result === 'success' ? 'activated' : 'failed';
      await tx.update(licenseKeys).set({ status, projectId: unit.projectId }).where(eq(licenseKeys.id, keyId));
    }
    const [res] = await tx.insert(activations).values({
      unitId,
      activationTypeId: input.activationTypeId,
      softwareId: input.softwareId,
      softwareVersion: input.softwareVersion,
      licenseKeyId: keyId,
      result: input.result,
      notes: input.notes,
      performedBy: actor.id,
    });
    await logActivity(tx, {
      userId: actor.id,
      action: 'add_activation',
      entityType: 'unit',
      entityId: unitId,
      newValues: { activationId: res.insertId, activationTypeId: input.activationTypeId, softwareId: input.softwareId, licenseKeyId: keyId, result: input.result },
      ipAddress: ip,
    });
  });
  return getUnit(db, unitId);
}

export async function removeActivation(db: Db, actor: Actor, unitId: number, activationId: number, ip: string | null) {
  ensureActivator(actor);
  await unitForActivation(db, unitId);
  const [act] = await db.select().from(activations).where(and(eq(activations.id, activationId), eq(activations.unitId, unitId)));
  if (!act) throw notFound('Aktivasi tidak ditemukan');
  await db.transaction(async (tx) => {
    await tx.delete(activations).where(eq(activations.id, activationId));
    // Key kembali ke stok supaya bisa dipakai unit lain.
    if (act.licenseKeyId) await tx.update(licenseKeys).set({ status: 'available' }).where(eq(licenseKeys.id, act.licenseKeyId));
    await logActivity(tx, { userId: actor.id, action: 'remove_activation', entityType: 'unit', entityId: unitId, oldValues: act, ipAddress: ip });
  });
  return getUnit(db, unitId);
}

/** Selesaikan aktivasi. Setiap unit wajib punya minimal satu aktivasi berhasil. */
export async function completeActivation(db: Db, actor: Actor, unitIds: number[], note: string | null) {
  ensureActivator(actor);
  const ok = await db
    .selectDistinct({ unitId: activations.unitId })
    .from(activations)
    .where(and(inArray(activations.unitId, unitIds), eq(activations.result, 'success')));
  const has = new Set(ok.map((r) => r.unitId));
  const missing = unitIds.filter((id) => !has.has(id));
  if (missing.length) {
    const sns = await db.select({ sn: units.serialNumber }).from(units).where(inArray(units.id, missing.slice(0, 5)));
    throw badRequest(`Unit belum punya aktivasi berhasil: ${sns.map((s) => s.sn).join(', ')}${missing.length > 5 ? ', …' : ''}`);
  }
  const moves = await db.transaction((tx) => advanceUnits(tx, actor, unitIds, 'activation', note));
  return { moved: moves.length };
}

/**
 * Aktivasi massal untuk project besar: catat satu aktivasi (dengan key dari stok atau tanpa key)
 * untuk setiap unit, lalu opsional langsung selesaikan tahapnya.
 */
export async function bulkActivate(
  db: Db,
  actor: Actor,
  input: Target & { unitIds: number[]; softwareVersion: string | null; withKey: boolean; complete: boolean },
) {
  ensureActivator(actor);
  if ((input.activationTypeId === null) === (input.softwareId === null)) throw badRequest('Pilih salah satu: jenis aktivasi atau software');
  await ensureTarget(db, input);
  const unitIds = [...new Set(input.unitIds)];
  const rows = await db
    .select({ id: units.id, sn: units.serialNumber, status: units.status, projectId: units.projectId, productTypeId: projectItems.productTypeId })
    .from(units)
    .innerJoin(projectItems, eq(units.projectItemId, projectItems.id))
    .where(inArray(units.id, unitIds));
  if (rows.length !== unitIds.length) throw badRequest('Sebagian unit tidak ditemukan');
  const wrong = rows.find((r) => r.status !== 'activation');
  if (wrong) throw badRequest(`Unit ${wrong.sn} tidak sedang di tahap Aktivasi`);
  for (const typeId of new Set(rows.map((r) => r.productTypeId))) await ensureTypeAllowed(db, typeId, input);

  return db.transaction(async (tx) => {
    const byProject = new Map<number, number[]>();
    for (const r of rows) byProject.set(r.projectId, [...(byProject.get(r.projectId) ?? []), r.id]);
    let keysUsed = 0;
    for (const [projectId, ids] of byProject) {
      const keys = input.withKey ? await pickKeys(tx, input, projectId, ids.length) : [];
      if (keys.length) {
        for (let i = 0; i < keys.length; i += 1000) {
          await tx.update(licenseKeys).set({ status: 'activated', projectId }).where(inArray(licenseKeys.id, keys.slice(i, i + 1000).map((k) => k.id)));
        }
      }
      for (let i = 0; i < ids.length; i += 1000) {
        await tx.insert(activations).values(
          ids.slice(i, i + 1000).map((unitId, j) => ({
            unitId,
            activationTypeId: input.activationTypeId,
            softwareId: input.softwareId,
            softwareVersion: input.softwareVersion,
            licenseKeyId: keys[i + j]?.id ?? null,
            result: 'success' as const,
            performedBy: actor.id,
          })),
        );
      }
      keysUsed += keys.length;
    }
    await logActivity(tx, {
      userId: actor.id,
      action: 'bulk_activate',
      entityType: 'unit',
      entityId: 'bulk',
      newValues: { units: unitIds.length, keysUsed, activationTypeId: input.activationTypeId, softwareId: input.softwareId, complete: input.complete },
    });
    const moved = input.complete ? (await advanceUnits(tx, actor, unitIds, 'activation')).length : 0;
    return { activated: unitIds.length, keysUsed, moved };
  });
}
