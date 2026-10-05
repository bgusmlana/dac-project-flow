import type { Paginated, Stage, WorkProjectDto, WorkQueueItemDto, WorkQueueQuery } from '@manpro/shared';
import { and, count, desc, eq, gt, like, type SQL } from 'drizzle-orm';
import type { Db } from '../db/index.js';
import { projectItems, projects, projectStageCounters, units } from '../db/schema.js';
import { encodeId } from '../lib/public-id.js';

/** Unit yang sedang menunggu / dikerjakan di tahap tertentu (antrian lini produksi). */
export async function workQueue(db: Db, stage: Stage, q: Omit<WorkQueueQuery, 'projectId'> & { projectId?: number }): Promise<Paginated<WorkQueueItemDto>> {
  const filters: (SQL | undefined)[] = [eq(units.status, stage)];
  if (q.projectId) filters.push(eq(units.projectId, q.projectId));
  if (q.search) filters.push(like(units.serialNumber, `%${q.search}%`));
  const where = and(...filters);
  const [rows, [totalRow]] = await Promise.all([
    db
      .select({
        id: units.id,
        serialNumber: units.serialNumber,
        projectId: units.projectId,
        projectCode: projects.code,
        brand: projectItems.brand,
        model: projectItems.model,
        since: units.updatedAt,
      })
      .from(units)
      .innerJoin(projects, eq(units.projectId, projects.id))
      .innerJoin(projectItems, eq(units.projectItemId, projectItems.id))
      .where(where)
      .orderBy(units.updatedAt, units.id)
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize),
    db.select({ total: count() }).from(units).where(where),
  ]);
  return {
    data: rows.map(({ brand, model, since, ...r }) => ({
      ...r,
      id: encodeId('unit', r.id),
      projectId: encodeId('project', r.projectId),
      itemLabel: `${brand} ${model}`,
      since: since.toISOString(),
    })),
    total: totalRow?.total ?? 0,
    page: q.page,
    pageSize: q.pageSize,
  };
}

/** ID unit di tahap ini (maksimal `limit`), urut dari yang paling lama menunggu. Untuk proses massal. */
export async function workQueueIds(db: Db, stage: Stage, projectId: number, limit: number): Promise<number[]> {
  const rows = await db
    .select({ id: units.id })
    .from(units)
    .where(and(eq(units.status, stage), eq(units.projectId, projectId)))
    .orderBy(units.updatedAt, units.id)
    .limit(limit);
  return rows.map((r) => r.id);
}

/** Project yang punya unit di tahap ini, beserta jumlahnya. */
export async function workProjects(db: Db, stage: Stage): Promise<WorkProjectDto[]> {
  const rows = await db
    .select({ projectId: projects.id, code: projects.code, name: projects.name, count: projectStageCounters.count })
    .from(projectStageCounters)
    .innerJoin(projects, eq(projectStageCounters.projectId, projects.id))
    .where(and(eq(projectStageCounters.status, stage), gt(projectStageCounters.count, 0)))
    .orderBy(desc(projectStageCounters.count));
  return rows.map((r) => ({ ...r, projectId: encodeId('project', r.projectId) }));
}
