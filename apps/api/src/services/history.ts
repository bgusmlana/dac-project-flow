import {
  ACTIVITY_ACTION_LABELS,
  ENTITY_TYPE_LABELS,
  UNIT_STATUS_LABELS,
  workResultLabel,
  type ActivityLogDto,
  type ActivityLogQuery,
  type Actor,
  type HistoryUserDto,
  type Paginated,
  type WorkHistoryFilter,
  type WorkHistoryItemDto,
  type WorkHistoryQuery,
  type WorkSummaryDto,
  type WorkSummaryRowDto,
} from '@manpro/shared';
import ExcelJS from 'exceljs';
import { and, asc, count, desc, eq, gte, inArray, like, lt, or, sql, type SQL } from 'drizzle-orm';
import { PassThrough } from 'node:stream';
import type { Db } from '../db/index.js';
import { activityLogs, divisions, projects, units, unitStageLogs, users } from '../db/schema.js';
import { badRequest } from '../lib/errors.js';
import { encodeId, tryDecodeId, type PublicKind } from '../lib/public-id.js';
import { addDays, localDaySql, localRange, localToday } from '../lib/time.js';

/** Filter di sisi server: ID project sudah diterjemahkan dari ID publik ke angka oleh route. */
type Filter = Omit<WorkHistoryFilter, 'projectId'> & { projectId?: number };
type Query = Omit<WorkHistoryQuery, 'projectId'> & { projectId?: number };

/** Rentang tanggal default: 7 hari terakhir. Rentang maksimal 1 tahun. */
function resolveRange(f: { from?: string; to?: string }) {
  const to = f.to ?? localToday();
  const from = f.from ?? addDays(to, -6);
  if (addDays(from, 366) < to) throw badRequest('Rentang tanggal maksimal 1 tahun');
  return { from, to, ...localRange(from, to) };
}

/**
 * Batas data yang boleh dilihat:
 * Staff hanya pekerjaannya sendiri, Leader semua staff di divisinya, Manager & Super Admin semuanya.
 */
function scopeConditions(actor: Actor, f: Filter): SQL[] {
  const c: SQL[] = [];
  if (actor.role === 'staff') c.push(eq(unitStageLogs.userId, actor.id));
  else if (actor.role === 'leader') c.push(eq(users.divisionId, actor.divisionId ?? -1));
  else if (f.divisionId) c.push(eq(users.divisionId, f.divisionId));
  if (f.userId) c.push(eq(unitStageLogs.userId, f.userId));
  if (f.projectId) c.push(eq(units.projectId, f.projectId));
  if (f.projectStatus === 'active') c.push(inArray(projects.status, ['draft', 'in_progress']));
  if (f.stage) c.push(eq(unitStageLogs.fromStatus, f.stage));
  if (f.action) c.push(eq(unitStageLogs.action, f.action));
  if (f.search) c.push(like(units.serialNumber, `%${f.search}%`));
  return c;
}

function workWhere(actor: Actor, f: Filter) {
  const range = resolveRange(f);
  const where = and(gte(unitStageLogs.createdAt, range.start), lt(unitStageLogs.createdAt, range.end), ...scopeConditions(actor, f));
  return { range, where };
}

const workColumns = {
  id: unitStageLogs.id,
  createdAt: unitStageLogs.createdAt,
  unitId: units.id,
  serialNumber: units.serialNumber,
  projectId: projects.id,
  projectCode: projects.code,
  fromStatus: unitStageLogs.fromStatus,
  toStatus: unitStageLogs.toStatus,
  action: unitStageLogs.action,
  note: unitStageLogs.note,
  userId: unitStageLogs.userId,
  userName: users.name,
  divisionName: divisions.name,
};

function workFrom(db: Db, select: Record<string, unknown>) {
  return db
    .select(select as typeof workColumns)
    .from(unitStageLogs)
    .innerJoin(units, eq(unitStageLogs.unitId, units.id))
    .innerJoin(projects, eq(units.projectId, projects.id))
    .leftJoin(users, eq(unitStageLogs.userId, users.id))
    .leftJoin(divisions, eq(users.divisionId, divisions.id));
}

type WorkRow = {
  [K in keyof typeof workColumns]: (typeof workColumns)[K]['_']['notNull'] extends true
    ? (typeof workColumns)[K]['_']['data']
    : (typeof workColumns)[K]['_']['data'] | null;
};

function toItem(r: WorkRow): WorkHistoryItemDto {
  return {
    ...r,
    unitId: encodeId('unit', r.unitId),
    projectId: encodeId('project', r.projectId),
    createdAt: r.createdAt.toISOString(),
  } as WorkHistoryItemDto;
}

/** Daftar riwayat pekerjaan (terbaru di atas). */
export async function listWorkHistory(db: Db, actor: Actor, q: Query): Promise<Paginated<WorkHistoryItemDto>> {
  const { where } = workWhere(actor, q);
  const [rows, [total]] = await Promise.all([
    workFrom(db, workColumns)
      .where(where)
      .orderBy(desc(unitStageLogs.id))
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize),
    workFrom(db, { n: count() }).where(where) as unknown as Promise<{ n: number }[]>,
  ]);
  return { data: (rows as WorkRow[]).map(toItem), total: Number(total?.n ?? 0), page: q.page, pageSize: q.pageSize };
}

/** Rekap jumlah pekerjaan per petugas per hari. */
export async function workSummary(db: Db, actor: Actor, f: Filter): Promise<WorkSummaryDto> {
  const { range, where } = workWhere(actor, f);
  const day = localDaySql(unitStageLogs.createdAt);
  const rows = (await workFrom(db, {
    date: day,
    userId: unitStageLogs.userId,
    userName: users.name,
    divisionName: divisions.name,
    advance: sql<number>`SUM(${unitStageLogs.action} = 'advance')`,
    qcPass: sql<number>`SUM(${unitStageLogs.action} = 'advance' AND ${unitStageLogs.fromStatus} = 'qc')`,
    rework: sql<number>`SUM(${unitStageLogs.action} IN ('rework', 'qc_fail'))`,
    create: sql<number>`SUM(${unitStageLogs.action} = 'create')`,
    total: sql<number>`COUNT(*)`,
  })
    .where(where)
    .groupBy(day, unitStageLogs.userId, users.name, divisions.name)
    .orderBy(desc(day), asc(users.name))) as unknown as WorkSummaryRowDto[];

  const byDay = rows.map((r) => ({
    ...r,
    date: String(r.date).slice(0, 10),
    advance: Number(r.advance),
    qcPass: Number(r.qcPass),
    rework: Number(r.rework),
    create: Number(r.create),
    total: Number(r.total),
  }));
  const users_ = new Map<string, Omit<WorkSummaryRowDto, 'date'>>();
  for (const r of byDay) {
    const k = r.userId ?? '';
    const u = users_.get(k) ?? { userId: r.userId, userName: r.userName, divisionName: r.divisionName, advance: 0, qcPass: 0, rework: 0, create: 0, total: 0 };
    u.advance += r.advance;
    u.qcPass += r.qcPass;
    u.rework += r.rework;
    u.create += r.create;
    u.total += r.total;
    users_.set(k, u);
  }
  return { from: range.from, to: range.to, byDay, byUser: [...users_.values()].sort((a, b) => b.total - a.total) };
}

/** Petugas yang boleh dipilih di filter (sesuai batas data). */
export async function historyUsers(db: Db, actor: Actor): Promise<HistoryUserDto[]> {
  const q = db
    .select({ id: users.id, name: users.name, divisionName: divisions.name })
    .from(users)
    .leftJoin(divisions, eq(users.divisionId, divisions.id));
  if (actor.role === 'staff') return q.where(eq(users.id, actor.id));
  if (actor.role === 'leader') return q.where(eq(users.divisionId, actor.divisionId ?? -1)).orderBy(asc(users.name));
  return q.orderBy(asc(users.name));
}

const EXPORT_LIMIT = 200_000;

/** Export riwayat pekerjaan ke Excel (streaming): sheet Rekap + sheet Riwayat. */
export async function exportWorkHistory(db: Db, actor: Actor, f: Filter) {
  const summary = await workSummary(db, actor, f);
  const { where } = workWhere(actor, f);

  const stream = new PassThrough();
  const wb = new ExcelJS.stream.xlsx.WorkbookWriter({ stream, useStyles: true });

  void (async () => {
    try {
      const rekap = wb.addWorksheet('Rekap per Petugas');
      rekap.columns = [
        { header: 'Tanggal', key: 'date', width: 12 },
        { header: 'Petugas', key: 'user', width: 24 },
        { header: 'Divisi', key: 'division', width: 16 },
        { header: 'Selesai tahap', key: 'advance', width: 14 },
        { header: 'Lulus QC', key: 'qcPass', width: 10 },
        { header: 'Gagal / rework', key: 'rework', width: 14 },
        { header: 'Didaftarkan', key: 'create', width: 12 },
        { header: 'Total', key: 'total', width: 10 },
      ];
      rekap.getRow(1).font = { bold: true };
      for (const r of summary.byDay) {
        rekap.addRow({ ...r, user: r.userName ?? 'sistem', division: r.divisionName ?? '' }).commit();
      }
      rekap.commit();

      const ws = wb.addWorksheet('Riwayat');
      ws.columns = [
        { header: 'Waktu', key: 'time', width: 18 },
        { header: 'Serial Number', key: 'sn', width: 24 },
        { header: 'Project', key: 'project', width: 16 },
        { header: 'Dari', key: 'from', width: 12 },
        { header: 'Ke', key: 'to', width: 12 },
        { header: 'Hasil', key: 'result', width: 24 },
        { header: 'Petugas', key: 'user', width: 24 },
        { header: 'Divisi', key: 'division', width: 16 },
        { header: 'Catatan', key: 'note', width: 50 },
      ];
      ws.getRow(1).font = { bold: true };
      let lastId: number | null = null;
      let written = 0;
      while (written < EXPORT_LIMIT) {
        const rows = (await workFrom(db, workColumns)
          .where(lastId === null ? where : and(where, lt(unitStageLogs.id, lastId)))
          .orderBy(desc(unitStageLogs.id))
          .limit(5000)) as WorkRow[];
        if (rows.length === 0) break;
        for (const r of rows) {
          ws.addRow({
            time: r.createdAt,
            sn: r.serialNumber,
            project: r.projectCode,
            from: r.fromStatus ? UNIT_STATUS_LABELS[r.fromStatus] : '',
            to: UNIT_STATUS_LABELS[r.toStatus],
            result: workResultLabel(r.action, r.fromStatus, r.toStatus),
            user: r.userName ?? 'sistem',
            division: r.divisionName ?? '',
            note: r.note ?? '',
          }).commit();
        }
        written += rows.length;
        lastId = rows[rows.length - 1]!.id;
      }
      ws.getColumn('time').numFmt = 'dd/mm/yyyy hh:mm';
      ws.commit();
      await wb.commit();
    } catch (e) {
      stream.destroy(e as Error);
    }
  })();

  return { stream, fileName: `riwayat-pekerjaan-${summary.from}_${summary.to}.xlsx` };
}

// ---------------------------------------------------------------------------
// Log Aktivitas (semua perubahan data) — Super Admin & Manager
// ---------------------------------------------------------------------------

const ENTITY_KINDS: Record<string, PublicKind> = { unit: 'unit', project: 'project', package: 'package', shipment: 'shipment' };

/** ID data di log: angka → ID publik untuk jenis yang punya halaman sendiri. */
function publicEntityId(entityType: string, entityId: string): string {
  const kind = ENTITY_KINDS[entityType];
  return kind && /^\d+$/.test(entityId) ? encodeId(kind, Number(entityId)) : entityId;
}

export async function listActivityLogs(db: Db, q: ActivityLogQuery): Promise<Paginated<ActivityLogDto>> {
  const range = resolveRange(q);
  const c: SQL[] = [gte(activityLogs.createdAt, range.start), lt(activityLogs.createdAt, range.end)];
  if (q.userId) c.push(eq(activityLogs.userId, q.userId));
  if (q.entityType) c.push(eq(activityLogs.entityType, q.entityType));
  if (q.action) c.push(eq(activityLogs.action, q.action));
  if (q.search) {
    const ids = Object.values(ENTITY_KINDS).map((k) => tryDecodeId(k, q.search!)).filter((n): n is number => n !== null);
    c.push(or(eq(activityLogs.entityId, ids.length ? String(ids[0]) : q.search), like(activityLogs.newValues, `%${q.search}%`))!);
  }
  const where = and(...c);

  const [rows, [total]] = await Promise.all([
    db
      .select({
        id: activityLogs.id,
        createdAt: activityLogs.createdAt,
        userId: activityLogs.userId,
        userName: users.name,
        action: activityLogs.action,
        entityType: activityLogs.entityType,
        entityId: activityLogs.entityId,
        oldValues: activityLogs.oldValues,
        newValues: activityLogs.newValues,
        ipAddress: activityLogs.ipAddress,
      })
      .from(activityLogs)
      .leftJoin(users, eq(activityLogs.userId, users.id))
      .where(where)
      .orderBy(desc(activityLogs.id))
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize),
    db.select({ n: count() }).from(activityLogs).where(where),
  ]);
  return {
    data: rows.map((r) => ({ ...r, entityId: publicEntityId(r.entityType, r.entityId), createdAt: r.createdAt.toISOString() })),
    total: Number(total?.n ?? 0),
    page: q.page,
    pageSize: q.pageSize,
  };
}

/** Pilihan filter: jenis data & aksi yang pernah tercatat, dengan label bahasa Indonesia. */
export async function activityLogFacets(db: Db) {
  const [types, actions] = await Promise.all([
    db.selectDistinct({ v: activityLogs.entityType }).from(activityLogs),
    db.selectDistinct({ v: activityLogs.action }).from(activityLogs),
  ]);
  const opt = (v: string, labels: Record<string, string>) => ({ value: v, label: labels[v] ?? v });
  return {
    entityTypes: types.map((t) => opt(t.v, ENTITY_TYPE_LABELS)).sort((a, b) => a.label.localeCompare(b.label)),
    actions: actions.map((a) => opt(a.v, ACTIVITY_ACTION_LABELS)).sort((a, b) => a.label.localeCompare(b.label)),
  };
}
