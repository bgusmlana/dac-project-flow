import type { DashboardDto, StatusCounts, UnitStatus } from '@manpro/shared';
import { and, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import type { Db } from '../db/index.js';
import { activationTypes, licenseKeys, lots, projects, projectStageCounters, shipments, software, unitStageLogs } from '../db/schema.js';
import { addDays, localDaySql, localToday, startOfLocalDay } from '../lib/time.js';
import { listProjects } from './projects.js';
import { decodeId, encodeId } from '../lib/public-id.js';

export async function getDashboard(db: Db): Promise<DashboardDto> {
  // Project aktif: ambil semua yang draft/berjalan (biasanya puluhan), urutkan deadline.
  const [draft, running] = await Promise.all([
    listProjects(db, { status: 'draft', page: 1, pageSize: 100 }),
    listProjects(db, { status: 'in_progress', page: 1, pageSize: 100 }),
  ]);
  const active = [...running.data, ...draft.data].sort((a, b) => (a.targetDate ?? '9999').localeCompare(b.targetDate ?? '9999'));
  const today = localToday();
  const soon = addDays(today, 7);

  const activeIds = active.map((p) => decodeId('project', p.id));
  const stageTotals: StatusCounts = {};
  if (activeIds.length) {
    const rows = await db
      .select({ status: projectStageCounters.status, n: sql<number>`SUM(${projectStageCounters.count})` })
      .from(projectStageCounters)
      .where(inArray(projectStageCounters.projectId, activeIds))
      .groupBy(projectStageCounters.status);
    for (const r of rows) if (Number(r.n) > 0) stageTotals[r.status] = Number(r.n);
  }

  const firstDay = addDays(localToday(), -6);
  const since = startOfLocalDay(firstDay);
  const day = localDaySql(unitStageLogs.createdAt);
  const [flow, onHold, keys, recent] = await Promise.all([
    db
      .select({ date: day, from: unitStageLogs.fromStatus, n: sql<number>`COUNT(*)` })
      .from(unitStageLogs)
      .where(and(eq(unitStageLogs.action, 'advance'), gte(unitStageLogs.createdAt, since)))
      .groupBy(day, unitStageLogs.fromStatus),
    db
      .select({ id: lots.id, code: lots.code, projectId: lots.projectId, projectCode: projects.code })
      .from(lots)
      .innerJoin(projects, eq(lots.projectId, projects.id))
      .where(eq(lots.status, 'on_hold')),
    db
      .select({ targetName: sql<string>`COALESCE(${activationTypes.name}, ${software.name})`, available: sql<number>`COUNT(*)` })
      .from(licenseKeys)
      .leftJoin(activationTypes, eq(licenseKeys.activationTypeId, activationTypes.id))
      .leftJoin(software, eq(licenseKeys.softwareId, software.id))
      .where(eq(licenseKeys.status, 'available'))
      .groupBy(activationTypes.name, software.name),
    db
      .select({ id: shipments.id, code: shipments.code, projectCode: projects.code, status: shipments.status, receivedAt: shipments.receivedAt, shippedAt: shipments.shippedAt })
      .from(shipments)
      .innerJoin(projects, eq(shipments.projectId, projects.id))
      .orderBy(desc(shipments.updatedAt))
      .limit(8),
  ]);

  const throughput: DashboardDto['throughput'] = [];
  for (let i = 0; i < 7; i++) {
    const key = addDays(firstDay, i);
    const counts: StatusCounts = {};
    for (const r of flow) {
      if (String(r.date).slice(0, 10) === key && r.from) counts[r.from as UnitStatus] = Number(r.n);
    }
    throughput.push({ date: key, counts });
  }

  return {
    projects: active,
    stageTotals,
    overdueCount: active.filter((p) => p.targetDate && p.targetDate < today).length,
    dueSoonCount: active.filter((p) => p.targetDate && p.targetDate >= today && p.targetDate <= soon).length,
    lotsOnHold: onHold.map((l) => ({ ...l, projectId: encodeId('project', l.projectId) })),
    throughput,
    keyStock: keys.map((k) => ({ targetName: k.targetName, available: Number(k.available) })).sort((a, b) => a.available - b.available),
    recentShipments: recent.map((r) => ({ ...r, id: encodeId('shipment', r.id), receivedAt: r.receivedAt?.toISOString() ?? null, shippedAt: r.shippedAt?.toISOString() ?? null })),
  };
}
