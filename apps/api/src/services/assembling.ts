import { canWorkStage, type Actor, type AddComponentInput } from '@manpro/shared';
import { and, eq, inArray } from 'drizzle-orm';
import type { Db } from '../db/index.js';
import { productTypeComponentCategories, projectItems, unitComponents, units } from '../db/schema.js';
import { logActivity } from '../lib/audit.js';
import { badRequest, conflict, forbidden, isDuplicateKeyError, notFound } from '../lib/errors.js';
import { getUnit } from './units.js';
import { advanceUnits } from './workflow.js';

function ensureAssembler(actor: Actor) {
  if (!canWorkStage(actor, 'assembling')) throw forbidden('Hanya divisi Assembling yang boleh mencatat komponen');
}

async function unitInAssembling(db: Db, unitId: number) {
  const [row] = await db
    .select({ status: units.status, productTypeId: projectItems.productTypeId })
    .from(units)
    .innerJoin(projectItems, eq(units.projectItemId, projectItems.id))
    .where(eq(units.id, unitId));
  if (!row) throw notFound('Unit tidak ditemukan');
  if (row.status !== 'assembling') throw badRequest('Unit tidak sedang di tahap Assembling');
  return row;
}

export async function addComponent(db: Db, actor: Actor, unitId: number, input: AddComponentInput, ip: string | null) {
  ensureAssembler(actor);
  const unit = await unitInAssembling(db, unitId);
  const [allowed] = await db
    .select()
    .from(productTypeComponentCategories)
    .where(
      and(
        eq(productTypeComponentCategories.productTypeId, unit.productTypeId),
        eq(productTypeComponentCategories.componentCategoryId, input.componentCategoryId),
      ),
    );
  if (!allowed) throw badRequest('Kategori komponen ini tidak berlaku untuk jenis produk unit');
  try {
    await db.transaction(async (tx) => {
      const [res] = await tx.insert(unitComponents).values({ unitId, ...input, installedBy: actor.id });
      await logActivity(tx, { userId: actor.id, action: 'add_component', entityType: 'unit', entityId: unitId, newValues: { componentId: res.insertId, ...input }, ipAddress: ip });
    });
  } catch (e) {
    if (isDuplicateKeyError(e)) throw conflict(`Serial number komponen ${input.serialNumber} sudah terpasang di unit lain`);
    throw e;
  }
  return getUnit(db, unitId);
}

export async function removeComponent(db: Db, actor: Actor, unitId: number, componentId: number, ip: string | null) {
  ensureAssembler(actor);
  await unitInAssembling(db, unitId);
  const [comp] = await db
    .select()
    .from(unitComponents)
    .where(and(eq(unitComponents.id, componentId), eq(unitComponents.unitId, unitId)));
  if (!comp) throw notFound('Komponen tidak ditemukan');
  await db.transaction(async (tx) => {
    await tx.delete(unitComponents).where(eq(unitComponents.id, componentId));
    await logActivity(tx, { userId: actor.id, action: 'remove_component', entityType: 'unit', entityId: unitId, oldValues: comp, ipAddress: ip });
  });
  return getUnit(db, unitId);
}

/** Selesaikan assembling. Setiap unit wajib punya minimal satu komponen tercatat. */
export async function completeAssembling(db: Db, actor: Actor, unitIds: number[], note: string | null) {
  ensureAssembler(actor);
  const withComponents = await db
    .selectDistinct({ unitId: unitComponents.unitId })
    .from(unitComponents)
    .where(inArray(unitComponents.unitId, unitIds));
  const has = new Set(withComponents.map((c) => c.unitId));
  const missing = unitIds.filter((id) => !has.has(id));
  if (missing.length) {
    const sns = await db.select({ sn: units.serialNumber }).from(units).where(inArray(units.id, missing.slice(0, 5)));
    throw badRequest(`Unit belum punya komponen tercatat: ${sns.map((s) => s.sn).join(', ')}${missing.length > 5 ? ', …' : ''}`);
  }
  const moves = await db.transaction((tx) => advanceUnits(tx, actor, unitIds, 'assembling', note));
  return { moved: moves.length };
}
