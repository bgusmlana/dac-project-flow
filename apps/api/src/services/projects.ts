import {
  itemStages,
  type Actor,
  type ListProjectsQuery,
  type Paginated,
  type ProjectDetailDto,
  type ProjectInput,
  type ProjectItemDto,
  type ProjectItemInput,
  type ProjectStatus,
  type ProjectSummaryDto,
  type StatusCounts,
} from '@manpro/shared';
import { and, count, desc, eq, inArray, like, or, sum, type SQL } from 'drizzle-orm';
import type { Db } from '../db/index.js';
import {
  clients,
  productTypes,
  productTypeStages,
  products,
  projectItems,
  projects,
  projectStageCounters,
  units,
  users,
  vendors,
} from '../db/schema.js';
import { logActivity } from '../lib/audit.js';
import { badRequest, notFound } from '../lib/errors.js';
import { encodeId, encodeIdOrNull } from '../lib/public-id.js';

// ---------------------------------------------------------------------------
// Baca
// ---------------------------------------------------------------------------
async function countsFor(db: Db, projectIds: number[]): Promise<Map<number, StatusCounts>> {
  const map = new Map<number, StatusCounts>();
  if (projectIds.length === 0) return map;
  const rows = await db.select().from(projectStageCounters).where(inArray(projectStageCounters.projectId, projectIds));
  for (const r of rows) {
    if (r.count === 0) continue;
    map.set(r.projectId, { ...map.get(r.projectId), [r.status]: r.count });
  }
  return map;
}

async function quantitiesFor(db: Db, projectIds: number[]): Promise<Map<number, number>> {
  if (projectIds.length === 0) return new Map();
  const rows = await db
    .select({ projectId: projectItems.projectId, total: sum(projectItems.quantity) })
    .from(projectItems)
    .where(inArray(projectItems.projectId, projectIds))
    .groupBy(projectItems.projectId);
  return new Map(rows.map((r) => [r.projectId, Number(r.total ?? 0)]));
}

const summaryColumns = {
  id: projects.id,
  code: projects.code,
  name: projects.name,
  clientId: projects.clientId,
  clientName: clients.name,
  poNumber: projects.poNumber,
  targetDate: projects.targetDate,
  status: projects.status,
};

function withTotals<T extends { id: number }>(rows: T[], counts: Map<number, StatusCounts>, qty: Map<number, number>) {
  return rows.map((r) => {
    const c = counts.get(r.id) ?? {};
    return {
      ...r,
      id: encodeId('project', r.id),
      counts: c,
      unitCount: Object.values(c).reduce((a, b) => a + (b ?? 0), 0),
      totalQuantity: qty.get(r.id) ?? 0,
    };
  });
}

export async function listProjects(db: Db, q: ListProjectsQuery): Promise<Paginated<ProjectSummaryDto>> {
  const filters: (SQL | undefined)[] = [];
  if (q.status) filters.push(eq(projects.status, q.status));
  if (q.clientId) filters.push(eq(projects.clientId, q.clientId));
  if (q.search) {
    const s = `%${q.search}%`;
    filters.push(or(like(projects.code, s), like(projects.name, s), like(projects.poNumber, s), like(clients.name, s)));
  }
  const where = and(...filters);
  const [rows, [totalRow]] = await Promise.all([
    db
      .select(summaryColumns)
      .from(projects)
      .innerJoin(clients, eq(projects.clientId, clients.id))
      .where(where)
      .orderBy(desc(projects.id))
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize),
    db.select({ total: count() }).from(projects).innerJoin(clients, eq(projects.clientId, clients.id)).where(where),
  ]);
  const ids = rows.map((r) => r.id);
  const [counts, qty] = await Promise.all([countsFor(db, ids), quantitiesFor(db, ids)]);
  return { data: withTotals(rows, counts, qty), total: totalRow?.total ?? 0, page: q.page, pageSize: q.pageSize };
}

export async function listProjectItems(db: Db, projectId: number): Promise<ProjectItemDto[]> {
  const [rows, unitCounts] = await Promise.all([
    db
      .select({
        id: projectItems.id,
        productId: projectItems.productId,
        productTypeId: projectItems.productTypeId,
        productTypeName: productTypes.name,
        brand: projectItems.brand,
        model: projectItems.model,
        partNumber: projectItems.partNumber,
        specification: projectItems.specification,
        vendorId: projectItems.vendorId,
        vendorName: vendors.name,
        quantity: projectItems.quantity,
        stages: projectItems.stages,
        accessories: projectItems.accessories,
      })
      .from(projectItems)
      .innerJoin(productTypes, eq(projectItems.productTypeId, productTypes.id))
      .innerJoin(vendors, eq(projectItems.vendorId, vendors.id))
      .where(eq(projectItems.projectId, projectId))
      .orderBy(projectItems.id),
    db
      .select({ itemId: units.projectItemId, n: count() })
      .from(units)
      .where(eq(units.projectId, projectId))
      .groupBy(units.projectItemId),
  ]);
  const byItem = new Map(unitCounts.map((u) => [u.itemId, u.n]));
  return rows.map((r) => ({ ...r, unitCount: byItem.get(r.id) ?? 0 }));
}

export async function getProject(db: Db, id: number): Promise<ProjectDetailDto> {
  const [row] = await db
    .select({
      ...summaryColumns,
      picUserId: projects.picUserId,
      picName: users.name,
      shippingAddress: projects.shippingAddress,
      notes: projects.notes,
      qcMode: projects.qcMode,
      lotSize: projects.lotSize,
      samplePercent: projects.samplePercent,
      maxSampleFail: projects.maxSampleFail,
      createdAt: projects.createdAt,
    })
    .from(projects)
    .innerJoin(clients, eq(projects.clientId, clients.id))
    .leftJoin(users, eq(projects.picUserId, users.id))
    .where(eq(projects.id, id));
  if (!row) throw notFound('Project tidak ditemukan');
  const [counts, qty, items] = await Promise.all([countsFor(db, [id]), quantitiesFor(db, [id]), listProjectItems(db, id)]);
  const [withTotal] = withTotals([row], counts, qty);
  return { ...withTotal!, createdAt: row.createdAt.toISOString(), items };
}

// ---------------------------------------------------------------------------
// Tulis
// ---------------------------------------------------------------------------
async function ensureActive(db: Db, table: typeof clients | typeof vendors, id: number, label: string) {
  const [row] = await db.select({ isActive: table.isActive }).from(table).where(eq(table.id, id));
  if (!row) throw badRequest(`${label} tidak ditemukan`);
  if (!row.isActive) throw badRequest(`${label} sudah dinonaktifkan`);
}

async function ensurePic(db: Db, picUserId: string | null) {
  if (!picUserId) return;
  const [u] = await db.select({ isActive: users.isActive }).from(users).where(eq(users.id, picUserId));
  if (!u?.isActive) throw badRequest('PIC tidak ditemukan atau nonaktif');
}

/** Kode project berikutnya: PRJ-<tahun>-<nomor urut 4 digit>. */
async function nextProjectCode(tx: Parameters<Parameters<Db['transaction']>[0]>[0]): Promise<string> {
  const prefix = `PRJ-${new Date().getFullYear()}-`;
  const [last] = await tx
    .select({ code: projects.code })
    .from(projects)
    .where(like(projects.code, `${prefix}%`))
    .orderBy(desc(projects.code))
    .limit(1)
    .for('update');
  const n = last ? Number(last.code.slice(prefix.length)) + 1 : 1;
  return prefix + String(n).padStart(4, '0');
}

export async function createProject(db: Db, actor: Actor, input: ProjectInput, ip: string | null) {
  await ensureActive(db, clients, input.clientId, 'Client');
  await ensurePic(db, input.picUserId);
  const id = await db.transaction(async (tx) => {
    const code = await nextProjectCode(tx);
    const [res] = await tx.insert(projects).values({ ...input, code, createdBy: actor.id });
    await logActivity(tx, { userId: actor.id, action: 'create', entityType: 'project', entityId: res.insertId, newValues: { code, ...input }, ipAddress: ip });
    return res.insertId;
  });
  return getProject(db, id);
}

export async function updateProject(db: Db, actor: Actor, id: number, input: ProjectInput, ip: string | null) {
  const before = await getProject(db, id);
  if (before.clientId !== input.clientId) await ensureActive(db, clients, input.clientId, 'Client');
  if (before.picUserId !== input.picUserId) await ensurePic(db, input.picUserId);
  await db.transaction(async (tx) => {
    await tx.update(projects).set(input).where(eq(projects.id, id));
    const { items: _items, counts: _counts, ...old } = before;
    await logActivity(tx, { userId: actor.id, action: 'update', entityType: 'project', entityId: id, oldValues: old, newValues: input, ipAddress: ip });
  });
  return getProject(db, id);
}

export async function setProjectStatus(db: Db, actor: Actor, id: number, status: ProjectStatus, ip: string | null) {
  const before = await getProject(db, id);
  await db.transaction(async (tx) => {
    await tx.update(projects).set({ status }).where(eq(projects.id, id));
    await logActivity(tx, {
      userId: actor.id,
      action: 'set_status',
      entityType: 'project',
      entityId: id,
      oldValues: { status: before.status },
      newValues: { status },
      ipAddress: ip,
    });
  });
  return getProject(db, id);
}

/** Pastikan project masih bisa diubah (tidak selesai/dibatalkan). */
export async function ensureProjectOpen(db: Db, projectId: number) {
  const [p] = await db.select({ status: projects.status }).from(projects).where(eq(projects.id, projectId));
  if (!p) throw notFound('Project tidak ditemukan');
  if (p.status === 'completed' || p.status === 'cancelled') throw badRequest('Project sudah selesai atau dibatalkan');
}

async function resolveItem(db: Db, input: ProjectItemInput) {
  const [product] = await db.select().from(products).where(eq(products.id, input.productId));
  if (!product) throw badRequest('Produk tidak ditemukan');
  if (!product.isActive) throw badRequest('Produk sudah dinonaktifkan');
  await ensureActive(db, vendors, input.vendorId, 'Vendor');
  const typeStages = await db.select().from(productTypeStages).where(eq(productTypeStages.productTypeId, product.productTypeId));
  const stages = itemStages(typeStages, input.optionalStages);
  const accessories = [...new Set(input.accessories.map((a) => a.trim()).filter(Boolean))];
  return {
    productId: product.id,
    vendorId: input.vendorId,
    productTypeId: product.productTypeId,
    brand: product.brand,
    model: product.model,
    partNumber: product.partNumber,
    specification: product.specification,
    quantity: input.quantity,
    stages,
    accessories,
  };
}

export async function addProjectItem(db: Db, actor: Actor, projectId: number, input: ProjectItemInput, ip: string | null) {
  await ensureProjectOpen(db, projectId);
  const values = await resolveItem(db, input);
  await db.transaction(async (tx) => {
    const [res] = await tx.insert(projectItems).values({ ...values, projectId });
    await logActivity(tx, { userId: actor.id, action: 'add_item', entityType: 'project', entityId: projectId, newValues: { itemId: res.insertId, ...values }, ipAddress: ip });
  });
  return getProject(db, projectId);
}

async function getItemRow(db: Db, projectId: number, itemId: number) {
  const [item] = await db
    .select()
    .from(projectItems)
    .where(and(eq(projectItems.id, itemId), eq(projectItems.projectId, projectId)));
  if (!item) throw notFound('Item tidak ditemukan');
  return item;
}

async function unitCountOf(db: Db, itemId: number) {
  const [row] = await db.select({ n: count() }).from(units).where(eq(units.projectItemId, itemId));
  return row?.n ?? 0;
}

export async function updateProjectItem(db: Db, actor: Actor, projectId: number, itemId: number, input: ProjectItemInput, ip: string | null) {
  await ensureProjectOpen(db, projectId);
  const before = await getItemRow(db, projectId, itemId);
  const values = await resolveItem(db, input);
  const existingUnits = await unitCountOf(db, itemId);
  if (existingUnits > 0) {
    // Setelah ada unit, produk & alur tahap tidak boleh diganti karena unit sudah berjalan di alur lama.
    if (values.productId !== before.productId) throw badRequest('Produk tidak bisa diganti karena item sudah punya unit');
    if (JSON.stringify(values.stages) !== JSON.stringify(before.stages)) throw badRequest('Tahapan tidak bisa diubah karena item sudah punya unit');
    if (values.quantity < existingUnits) throw badRequest(`Jumlah tidak boleh kurang dari unit yang sudah terdaftar (${existingUnits})`);
  }
  await db.transaction(async (tx) => {
    await tx.update(projectItems).set(values).where(eq(projectItems.id, itemId));
    await logActivity(tx, { userId: actor.id, action: 'update_item', entityType: 'project', entityId: projectId, oldValues: before, newValues: values, ipAddress: ip });
  });
  return getProject(db, projectId);
}

export async function deleteProjectItem(db: Db, actor: Actor, projectId: number, itemId: number, ip: string | null) {
  await ensureProjectOpen(db, projectId);
  const before = await getItemRow(db, projectId, itemId);
  if ((await unitCountOf(db, itemId)) > 0) throw badRequest('Item tidak bisa dihapus karena sudah punya unit');
  await db.transaction(async (tx) => {
    await tx.delete(projectItems).where(eq(projectItems.id, itemId));
    await logActivity(tx, { userId: actor.id, action: 'delete_item', entityType: 'project', entityId: projectId, oldValues: before, ipAddress: ip });
  });
  return getProject(db, projectId);
}

/** Daftar nama user aktif untuk pilihan PIC. */
export async function userOptions(db: Db) {
  return db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(eq(users.isActive, true))
    .orderBy(users.name);
}
