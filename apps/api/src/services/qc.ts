import {
  canWorkStage,
  reworkTargets,
  type Actor,
  type InspectInput,
  type InspectResultDto,
  type LotDetailDto,
  type LotStatus,
  type LotSummaryDto,
  type QcFormDto,
  type QcInspectionDto,
  type Stage,
} from '@manpro/shared';
import { and, asc, count, desc, eq, inArray, isNull, like, sql } from 'drizzle-orm';
import type { Db, DbOrTx } from '../db/index.js';
import {
  lots,
  lotSamples,
  projectItems,
  projects,
  qcInspectionResults,
  qcInspections,
  qcTemplateItems,
  qcTemplates,
  units,
  unitStageLogs,
  users,
} from '../db/schema.js';
import { logActivity } from '../lib/audit.js';
import { badRequest, forbidden, notFound } from '../lib/errors.js';
import { advanceUnits, reworkUnits, type UnitMove } from './workflow.js';
import { encodeId, encodeIdOrNull } from '../lib/public-id.js';

function ensureQc(actor: Actor) {
  if (!canWorkStage(actor, 'qc')) throw forbidden('Hanya divisi QC yang boleh melakukan QC');
}

/** Keputusan lot yang ditahan: Super Admin, Manager, atau Leader divisi QC. */
function ensureLotDecider(actor: Actor) {
  const ok = actor.role === 'super_admin' || actor.role === 'manager' || (actor.role === 'leader' && actor.divisionCode === 'QC');
  if (!ok) throw forbidden('Hanya Manager atau Leader QC yang boleh memutuskan lot yang ditahan');
}

async function unitContext(db: DbOrTx, unitId: number) {
  const [row] = await db
    .select({
      id: units.id,
      serialNumber: units.serialNumber,
      status: units.status,
      lotId: units.lotId,
      projectId: units.projectId,
      stages: projectItems.stages,
      productTypeId: projectItems.productTypeId,
      qcMode: projects.qcMode,
    })
    .from(units)
    .innerJoin(projectItems, eq(units.projectItemId, projectItems.id))
    .innerJoin(projects, eq(units.projectId, projects.id))
    .where(eq(units.id, unitId));
  if (!row) throw notFound('Unit tidak ditemukan');
  return row;
}

async function activeTemplate(db: DbOrTx, productTypeId: number) {
  const [t] = await db
    .select()
    .from(qcTemplates)
    .where(and(eq(qcTemplates.productTypeId, productTypeId), eq(qcTemplates.isActive, true)))
    .orderBy(desc(qcTemplates.version))
    .limit(1);
  if (!t) return null;
  const items = await db.select().from(qcTemplateItems).where(eq(qcTemplateItems.qcTemplateId, t.id)).orderBy(asc(qcTemplateItems.sortOrder));
  return { ...t, items };
}

async function history(db: DbOrTx, unitId: number): Promise<QcInspectionDto[]> {
  const rows = await db
    .select({
      id: qcInspections.id,
      result: qcInspections.result,
      templateVersion: qcTemplates.version,
      lotId: qcInspections.lotId,
      lotCode: lots.code,
      notes: qcInspections.notes,
      inspectedByName: users.name,
      createdAt: qcInspections.createdAt,
    })
    .from(qcInspections)
    .innerJoin(qcTemplates, eq(qcInspections.qcTemplateId, qcTemplates.id))
    .leftJoin(lots, eq(qcInspections.lotId, lots.id))
    .leftJoin(users, eq(qcInspections.inspectedBy, users.id))
    .where(eq(qcInspections.unitId, unitId))
    .orderBy(desc(qcInspections.id));
  if (rows.length === 0) return [];
  const results = await db
    .select({
      inspectionId: qcInspectionResults.qcInspectionId,
      label: qcTemplateItems.label,
      inputType: qcTemplateItems.inputType,
      sortOrder: qcTemplateItems.sortOrder,
      passed: qcInspectionResults.passed,
      value: qcInspectionResults.value,
    })
    .from(qcInspectionResults)
    .innerJoin(qcTemplateItems, eq(qcInspectionResults.qcTemplateItemId, qcTemplateItems.id))
    .where(inArray(qcInspectionResults.qcInspectionId, rows.map((r) => r.id)))
    .orderBy(asc(qcTemplateItems.sortOrder));
  return rows.map(({ lotId, createdAt, ...r }) => ({
    ...r,
    isSample: lotId !== null,
    createdAt: createdAt.toISOString(),
    results: results.filter((x) => x.inspectionId === r.id).map(({ label, inputType, passed, value }) => ({ label, inputType, passed, value })),
  }));
}

export async function getQcForm(db: Db, unitId: number): Promise<QcFormDto> {
  const u = await unitContext(db, unitId);
  const tpl = await activeTemplate(db, u.productTypeId);
  let lot: QcFormDto['lot'] = null;
  let isSample = false;
  if (u.lotId) {
    const [l] = await db.select({ id: lots.id, code: lots.code, status: lots.status }).from(lots).where(eq(lots.id, u.lotId));
    lot = l ?? null;
    const [s] = await db.select().from(lotSamples).where(and(eq(lotSamples.lotId, u.lotId), eq(lotSamples.unitId, unitId)));
    isSample = !!s;
  }
  return {
    unitId: encodeId('unit', unitId),
    templateId: tpl?.id ?? null,
    templateVersion: tpl?.version ?? null,
    items: (tpl?.items ?? []).map((i) => ({ id: i.id, label: i.label, inputType: i.inputType, isRequired: i.isRequired })),
    reworkTargets: reworkTargets(u.stages, 'qc'),
    qcMode: u.qcMode,
    lot,
    isSample,
    history: await history(db, unitId),
  };
}

// ---------------------------------------------------------------------------
// Inspeksi
// ---------------------------------------------------------------------------
export async function inspect(db: Db, actor: Actor, unitId: number, input: InspectInput, ip: string | null): Promise<InspectResultDto> {
  ensureQc(actor);
  const u = await unitContext(db, unitId);
  if (u.status !== 'qc') throw badRequest('Unit tidak sedang di tahap QC');
  const tpl = await activeTemplate(db, u.productTypeId);
  if (!tpl || tpl.items.length === 0) throw badRequest('Jenis produk ini belum punya checklist QC. Atur di Master Data → Jenis Produk.');

  let sampleLot: typeof lots.$inferSelect | null = null;
  if (u.qcMode === 'sampling') {
    if (!u.lotId) throw badRequest('Project ini memakai QC sampling: bentuk lot dulu sebelum memeriksa unit');
    const [l] = await db.select().from(lots).where(eq(lots.id, u.lotId));
    if (!l || l.status !== 'sampling') throw badRequest(`Lot ${l?.code ?? ''} sudah tidak dalam tahap sampling`);
    const [s] = await db.select().from(lotSamples).where(and(eq(lotSamples.lotId, l.id), eq(lotSamples.unitId, unitId)));
    if (!s) throw badRequest(`Unit ini bukan sampel lot ${l.code}; hanya unit sampel yang diperiksa`);
    const [done] = await db.select({ id: qcInspections.id }).from(qcInspections).where(and(eq(qcInspections.unitId, unitId), eq(qcInspections.lotId, l.id)));
    if (done) throw badRequest('Sampel ini sudah diperiksa');
    sampleLot = l;
  }

  // Validasi jawaban
  const answers = new Map(input.results.map((r) => [r.itemId, r]));
  for (const id of answers.keys()) if (!tpl.items.some((i) => i.id === id)) throw badRequest('Poin QC tidak sesuai checklist yang berlaku');
  let failed = false;
  for (const item of tpl.items) {
    const a = answers.get(item.id);
    if (item.inputType === 'pass_fail') {
      if (a?.passed === null || a?.passed === undefined) {
        if (item.isRequired) throw badRequest(`Poin "${item.label}" belum diisi`);
      } else if (a.passed === false) failed = true;
    } else if (item.inputType === 'number') {
      if (a?.value === null || a?.value === undefined) {
        if (item.isRequired) throw badRequest(`Poin "${item.label}" belum diisi`);
      } else if (Number.isNaN(Number(a.value.replace(',', '.')))) throw badRequest(`Poin "${item.label}" harus angka`);
    } else if (item.isRequired && !a?.value) throw badRequest(`Poin "${item.label}" belum diisi`);
  }
  const result = failed ? 'fail' : 'pass';
  if (failed && input.reworkTo && !reworkTargets(u.stages, 'qc').includes(input.reworkTo)) {
    throw badRequest('Tahap tujuan rework tidak ada di alur unit ini');
  }
  if (failed && !input.notes) throw badRequest('Tulis catatan kerusakan untuk unit yang gagal QC');

  const lot = await db.transaction(async (tx) => {
    const [res] = await tx.insert(qcInspections).values({
      unitId,
      lotId: sampleLot?.id ?? null,
      qcTemplateId: tpl.id,
      result,
      reworkTo: failed ? input.reworkTo : null,
      notes: input.notes,
      inspectedBy: actor.id,
    });
    const rows = tpl.items
      .map((i) => ({ i, a: answers.get(i.id) }))
      .filter(({ a }) => a && (a.passed !== null || a.value !== null))
      .map(({ i, a }) => ({ qcInspectionId: res.insertId, qcTemplateItemId: i.id, passed: a!.passed, value: a!.value }));
    if (rows.length) await tx.insert(qcInspectionResults).values(rows);
    await logActivity(tx, { userId: actor.id, action: 'qc_inspect', entityType: 'unit', entityId: unitId, newValues: { inspectionId: res.insertId, result, lotId: sampleLot?.id ?? null }, ipAddress: ip });

    if (sampleLot) return evaluateLot(tx, actor, sampleLot.id);
    if (result === 'pass') await advanceUnits(tx, actor, [unitId], 'qc');
    else if (input.reworkTo) await reworkUnits(tx, actor, [unitId], 'qc', input.reworkTo, `QC gagal: ${input.notes}`);
    // Gagal tapi tetap di QC: unit tidak berpindah, tetap dicatat supaya muncul di riwayat pekerjaan.
    else await tx.insert(unitStageLogs).values({ unitId, fromStatus: 'qc', toStatus: 'qc', action: 'qc_fail', note: `QC gagal: ${input.notes}`, userId: actor.id });
    return null;
  });

  const [after] = await db.select({ status: units.status }).from(units).where(eq(units.id, unitId));
  return { result, unitStatus: after!.status, lot };
}

// ---------------------------------------------------------------------------
// Lot (mode sampling)
// ---------------------------------------------------------------------------
async function lotSummary(db: DbOrTx, lotId: number): Promise<LotSummaryDto> {
  const [l] = await db.select().from(lots).where(eq(lots.id, lotId));
  if (!l) throw notFound('Lot tidak ditemukan');
  const [stats] = await db
    .select({
      inspected: count(qcInspections.id),
      failed: sql<number>`COALESCE(SUM(${qcInspections.result} = 'fail'), 0)`,
    })
    .from(qcInspections)
    .where(eq(qcInspections.lotId, lotId));
  return {
    id: l.id,
    code: l.code,
    projectId: encodeId('project', l.projectId),
    status: l.status,
    size: l.size,
    sampleSize: l.sampleSize,
    inspected: stats?.inspected ?? 0,
    failed: Number(stats?.failed ?? 0),
    maxSampleFail: l.maxSampleFail,
    decisionNote: l.decisionNote,
    createdAt: l.createdAt.toISOString(),
  };
}

/** Unit dalam lot yang masih di QC. */
async function lotUnitsInQc(tx: DbOrTx, lotId: number) {
  return tx
    .select({ id: units.id })
    .from(units)
    .where(and(eq(units.lotId, lotId), eq(units.status, 'qc')))
    .then((r) => r.map((x) => x.id));
}

/**
 * Loloskan lot: sampel yang gagal di-rework sesuai tujuan di inspeksinya (keluar dari lot),
 * semua unit lain lanjut ke tahap berikutnya.
 */
async function passLot(tx: DbOrTx, actor: Actor, lotId: number, status: LotStatus, note: string | null) {
  const failedSamples = await tx
    .select({ unitId: qcInspections.unitId, reworkTo: qcInspections.reworkTo, notes: qcInspections.notes })
    .from(qcInspections)
    .where(and(eq(qcInspections.lotId, lotId), eq(qcInspections.result, 'fail')));
  const failedIds = new Set(failedSamples.map((f) => f.unitId));
  for (const f of failedSamples) {
    if (!f.reworkTo) continue; // tanpa tujuan rework: unit tetap di QC untuk diperiksa ulang
    await reworkUnits(tx, actor, [f.unitId], 'qc', f.reworkTo, `QC sampel gagal: ${f.notes ?? ''}`);
  }
  if (failedIds.size) await tx.update(units).set({ lotId: null }).where(inArray(units.id, [...failedIds]));
  const rest = (await lotUnitsInQc(tx, lotId)).filter((id) => !failedIds.has(id));
  if (rest.length) await advanceUnits(tx, actor, rest, 'qc', note ? `Lot diloloskan: ${note}` : 'Lot lulus sampling QC');
  await tx.update(lots).set({ status, decisionNote: note, decidedBy: note ? actor.id : null }).where(eq(lots.id, lotId));
}

/** Hitung ulang status lot setelah sampel diperiksa. */
async function evaluateLot(tx: DbOrTx, actor: Actor, lotId: number): Promise<LotSummaryDto> {
  const s = await lotSummary(tx, lotId);
  if (s.status !== 'sampling') return s;
  if (s.failed > s.maxSampleFail) {
    await tx.update(lots).set({ status: 'on_hold' }).where(eq(lots.id, lotId));
  } else if (s.inspected >= s.sampleSize) {
    await passLot(tx, actor, lotId, 'passed', null);
  }
  return lotSummary(tx, lotId);
}

export async function createLot(db: Db, actor: Actor, projectId: number, ip: string | null): Promise<LotDetailDto> {
  ensureQc(actor);
  const [p] = await db.select().from(projects).where(eq(projects.id, projectId));
  if (!p) throw notFound('Project tidak ditemukan');
  if (p.qcMode !== 'sampling' || !p.lotSize || !p.samplePercent) throw badRequest('Project ini tidak memakai QC sampling');

  const lotId = await db.transaction(async (tx) => {
    const ids = await tx
      .select({ id: units.id })
      .from(units)
      .where(and(eq(units.projectId, projectId), eq(units.status, 'qc'), isNull(units.lotId)))
      .orderBy(units.updatedAt, units.id)
      .limit(p.lotSize!)
      .for('update', { skipLocked: true })
      .then((r) => r.map((x) => x.id));
    if (ids.length === 0) throw badRequest('Tidak ada unit di antrian QC yang belum masuk lot');

    const [last] = await tx.select({ code: lots.code }).from(lots).where(and(eq(lots.projectId, projectId), like(lots.code, 'LOT-%'))).orderBy(desc(lots.id)).limit(1).for('update');
    const code = `LOT-${String((last ? Number(last.code.slice(4)) : 0) + 1).padStart(3, '0')}`;
    const sampleSize = Math.min(ids.length, Math.max(1, Math.ceil((ids.length * p.samplePercent!) / 100)));
    // Sampel dipilih acak (Fisher–Yates).
    const shuffled = [...ids];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
    }
    const [res] = await tx.insert(lots).values({ projectId, code, size: ids.length, sampleSize, maxSampleFail: p.maxSampleFail ?? 0, createdBy: actor.id });
    for (let i = 0; i < ids.length; i += 1000) await tx.update(units).set({ lotId: res.insertId }).where(inArray(units.id, ids.slice(i, i + 1000)));
    await tx.insert(lotSamples).values(shuffled.slice(0, sampleSize).map((unitId) => ({ lotId: res.insertId, unitId })));
    await logActivity(tx, { userId: actor.id, action: 'create_lot', entityType: 'project', entityId: projectId, newValues: { lotId: res.insertId, code, size: ids.length, sampleSize }, ipAddress: ip });
    return res.insertId;
  });
  return getLot(db, lotId);
}

export async function listLots(db: Db, projectId: number): Promise<LotSummaryDto[]> {
  const rows = await db.select({ id: lots.id }).from(lots).where(eq(lots.projectId, projectId)).orderBy(desc(lots.id));
  return Promise.all(rows.map((r) => lotSummary(db, r.id)));
}

export async function getLot(db: Db, lotId: number): Promise<LotDetailDto> {
  const summary = await lotSummary(db, lotId);
  const samples = await db
    .select({ unitId: lotSamples.unitId, serialNumber: units.serialNumber, result: qcInspections.result })
    .from(lotSamples)
    .innerJoin(units, eq(lotSamples.unitId, units.id))
    .leftJoin(qcInspections, and(eq(qcInspections.unitId, lotSamples.unitId), eq(qcInspections.lotId, lotId)))
    .where(eq(lotSamples.lotId, lotId))
    .orderBy(units.serialNumber);
  return { ...summary, samples: samples.map((s) => ({ ...s, unitId: encodeId('unit', s.unitId), result: s.result ?? null })) };
}

/** Keputusan untuk lot yang ditahan. */
export async function decideLot(
  db: Db,
  actor: Actor,
  lotId: number,
  input: { action: 'release' | 'rework'; reworkTo: Stage | null; note: string },
  ip: string | null,
): Promise<LotDetailDto> {
  ensureLotDecider(actor);
  const s = await lotSummary(db, lotId);
  if (s.status !== 'on_hold') throw badRequest('Hanya lot yang ditahan yang bisa diputuskan');
  await db.transaction(async (tx) => {
    if (input.action === 'release') {
      await passLot(tx, actor, lotId, 'released', input.note);
    } else {
      const ids = await lotUnitsInQc(tx, lotId);
      let moves: UnitMove[] = [];
      if (ids.length) moves = await reworkUnits(tx, actor, ids, 'qc', input.reworkTo!, `Lot ${s.code} dikembalikan: ${input.note}`);
      if (ids.length) await tx.update(units).set({ lotId: null }).where(inArray(units.id, ids));
      await tx.update(lots).set({ status: 'reworked', decisionNote: input.note, decidedBy: actor.id }).where(eq(lots.id, lotId));
      void moves;
    }
    await logActivity(tx, { userId: actor.id, action: `lot_${input.action}`, entityType: 'lot', entityId: lotId, newValues: input, ipAddress: ip });
  });
  return getLot(db, lotId);
}
