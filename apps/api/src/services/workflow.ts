import { canWorkStage, nextStatus, STAGE_LABELS, UNIT_STATUS_LABELS, type Actor, type Stage, type UnitStatus } from '@manpro/shared';
import { eq, inArray, sql } from 'drizzle-orm';
import type { DbOrTx } from '../db/index.js';
import { projectItems, projects, projectStageCounters, units, unitStageLogs } from '../db/schema.js';
import { badRequest, forbidden } from '../lib/errors.js';

/** Tambah/kurangi counter jumlah unit per status. */
export async function adjustCounter(db: DbOrTx, projectId: number, status: UnitStatus, delta: number) {
  if (delta === 0) return;
  await db
    .insert(projectStageCounters)
    .values({ projectId, status, count: delta })
    .onDuplicateKeyUpdate({ set: { count: sql`${projectStageCounters.count} + ${delta}` } });
}

export interface UnitMove {
  id: number;
  projectId: number;
  from: UnitStatus;
  to: UnitStatus;
}

/**
 * Pindahkan status banyak unit sekaligus + catat riwayat + perbarui counter.
 * Harus dipanggil di dalam transaksi.
 */
export async function applyMoves(tx: DbOrTx, moves: UnitMove[], action: string, note: string | null, userId: string | null) {
  if (moves.length === 0) return;
  const groups = new Map<string, UnitMove[]>();
  for (const m of moves) {
    const k = `${m.projectId}|${m.from}|${m.to}`;
    groups.set(k, [...(groups.get(k) ?? []), m]);
  }
  for (const group of groups.values()) {
    const { projectId, from, to } = group[0]!;
    for (let i = 0; i < group.length; i += 1000) {
      const ids = group.slice(i, i + 1000).map((m) => m.id);
      await tx.update(units).set({ status: to }).where(inArray(units.id, ids));
    }
    await adjustCounter(tx, projectId, from, -group.length);
    await adjustCounter(tx, projectId, to, group.length);
  }
  for (let i = 0; i < moves.length; i += 1000) {
    await tx.insert(unitStageLogs).values(
      moves.slice(i, i + 1000).map((m) => ({ unitId: m.id, fromStatus: m.from, toStatus: m.to, action, note, userId })),
    );
  }
  // Project otomatis "Berjalan" begitu ada unit yang bergerak.
  const projectIds = [...new Set(moves.map((m) => m.projectId))];
  await tx
    .update(projects)
    .set({ status: 'in_progress' })
    .where(sql`${projects.id} IN (${sql.join(projectIds, sql`, `)}) AND ${projects.status} = 'draft'`);

  // Project otomatis "Selesai" kalau semua unit pesanan sudah selesai.
  for (const projectId of new Set(moves.filter((m) => m.to === 'completed').map((m) => m.projectId))) {
    const [row] = await tx
      .select({
        done: sql<number>`COALESCE(SUM(CASE WHEN ${projectStageCounters.status} = 'completed' THEN ${projectStageCounters.count} END), 0)`,
        open: sql<number>`COALESCE(SUM(CASE WHEN ${projectStageCounters.status} <> 'completed' THEN ${projectStageCounters.count} END), 0)`,
      })
      .from(projectStageCounters)
      .where(eq(projectStageCounters.projectId, projectId));
    const [qty] = await tx
      .select({ total: sql<number>`COALESCE(SUM(${projectItems.quantity}), 0)` })
      .from(projectItems)
      .where(eq(projectItems.projectId, projectId));
    if (Number(row?.open) === 0 && Number(row?.done) >= Number(qty?.total)) {
      await tx.update(projects).set({ status: 'completed' }).where(eq(projects.id, projectId));
    }
  }
}

export interface UnitWithStages {
  id: number;
  projectId: number;
  serialNumber: string;
  status: UnitStatus;
  stages: Stage[];
}

/** Ambil unit beserta urutan tahap item-nya. */
export async function loadUnitsWithStages(db: DbOrTx, unitIds: number[]): Promise<UnitWithStages[]> {
  if (unitIds.length === 0) return [];
  const rows: UnitWithStages[] = [];
  for (let i = 0; i < unitIds.length; i += 1000) {
    rows.push(
      ...(await db
        .select({ id: units.id, projectId: units.projectId, serialNumber: units.serialNumber, status: units.status, stages: projectItems.stages })
        .from(units)
        .innerJoin(projectItems, eq(units.projectItemId, projectItems.id))
        .where(inArray(units.id, unitIds.slice(i, i + 1000)))
        .for('update')),
    );
  }
  return rows;
}

/**
 * Selesaikan tahap `stage` untuk unit-unit ini → pindah ke tahap berikutnya sesuai alur item-nya.
 * Semua unit harus sedang berada di tahap tersebut.
 */
export async function advanceUnits(tx: DbOrTx, actor: Actor, unitIds: number[], stage: Stage, note: string | null = null) {
  if (!canWorkStage(actor, stage)) throw forbidden(`Hanya divisi ${STAGE_LABELS[stage]} yang boleh menyelesaikan tahap ini`);
  const rows = await loadUnitsWithStages(tx, unitIds);
  if (rows.length !== new Set(unitIds).size) throw badRequest('Sebagian unit tidak ditemukan');
  const wrong = rows.filter((u) => u.status !== stage);
  if (wrong.length) {
    const u = wrong[0]!;
    throw badRequest(`Unit ${u.serialNumber} sedang di tahap ${UNIT_STATUS_LABELS[u.status]}, bukan ${STAGE_LABELS[stage]}`);
  }
  const moves = rows.map((u) => ({ id: u.id, projectId: u.projectId, from: u.status, to: nextStatus(u.stages, u.status) }));
  await applyMoves(tx, moves, 'advance', note, actor.id);
  return moves;
}

/** Kembalikan unit ke tahap sebelumnya (misalnya QC gagal). */
export async function reworkUnits(tx: DbOrTx, actor: Actor, unitIds: number[], from: Stage, to: Stage, note: string) {
  if (!canWorkStage(actor, from)) throw forbidden(`Hanya divisi ${STAGE_LABELS[from]} yang boleh mengembalikan unit dari tahap ini`);
  const rows = await loadUnitsWithStages(tx, unitIds);
  for (const u of rows) {
    if (u.status !== from) throw badRequest(`Unit ${u.serialNumber} tidak sedang di tahap ${STAGE_LABELS[from]}`);
    const i = u.stages.indexOf(to);
    if (i === -1 || i >= u.stages.indexOf(from)) throw badRequest(`Unit ${u.serialNumber} tidak bisa dikembalikan ke ${STAGE_LABELS[to]}`);
  }
  const moves = rows.map((u) => ({ id: u.id, projectId: u.projectId, from: u.status, to: to as UnitStatus }));
  await applyMoves(tx, moves, 'rework', note, actor.id);
  return moves;
}
