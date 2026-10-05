import type { Actor, ListProductsQuery, Paginated, ProductDto, ProductInput } from '@manpro/shared';
import { and, asc, count, eq, like, or, type SQL } from 'drizzle-orm';
import type { Db } from '../db/index.js';
import { products, productTypes } from '../db/schema.js';
import { logActivity } from '../lib/audit.js';
import { badRequest, conflict, isDuplicateKeyError, notFound } from '../lib/errors.js';

const columns = {
  id: products.id,
  productTypeId: products.productTypeId,
  productTypeName: productTypes.name,
  brand: products.brand,
  model: products.model,
  partNumber: products.partNumber,
  specification: products.specification,
  isActive: products.isActive,
};

export async function listProducts(db: Db, q: ListProductsQuery): Promise<Paginated<ProductDto>> {
  const filters: (SQL | undefined)[] = [];
  if (!q.includeInactive) filters.push(eq(products.isActive, true));
  if (q.productTypeId) filters.push(eq(products.productTypeId, q.productTypeId));
  if (q.search) {
    const s = `%${q.search}%`;
    filters.push(or(like(products.brand, s), like(products.model, s), like(products.partNumber, s)));
  }
  const where = and(...filters);
  const [rows, [totalRow]] = await Promise.all([
    db
      .select(columns)
      .from(products)
      .innerJoin(productTypes, eq(products.productTypeId, productTypes.id))
      .where(where)
      .orderBy(asc(products.brand), asc(products.model))
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize),
    db.select({ total: count() }).from(products).where(where),
  ]);
  return { data: rows, total: totalRow?.total ?? 0, page: q.page, pageSize: q.pageSize };
}

async function getProduct(db: Db, id: number): Promise<ProductDto> {
  const [row] = await db
    .select(columns)
    .from(products)
    .innerJoin(productTypes, eq(products.productTypeId, productTypes.id))
    .where(eq(products.id, id));
  if (!row) throw notFound('Produk tidak ditemukan');
  return row;
}

async function ensureProductType(db: Db, id: number) {
  const [row] = await db.select({ isActive: productTypes.isActive }).from(productTypes).where(eq(productTypes.id, id));
  if (!row) throw badRequest('Jenis produk tidak ditemukan');
  if (!row.isActive) throw badRequest('Jenis produk sudah dinonaktifkan');
}

function duplicate(error: unknown): never {
  if (isDuplicateKeyError(error)) throw conflict('Produk dengan merek dan part number ini sudah ada');
  throw error;
}

export async function createProduct(db: Db, actor: Actor, input: ProductInput, ip: string | null) {
  await ensureProductType(db, input.productTypeId);
  const id = await db
    .transaction(async (tx) => {
      const [res] = await tx.insert(products).values(input);
      await logActivity(tx, { userId: actor.id, action: 'create', entityType: 'product', entityId: res.insertId, newValues: input, ipAddress: ip });
      return res.insertId;
    })
    .catch(duplicate);
  return getProduct(db, id);
}

export async function updateProduct(db: Db, actor: Actor, id: number, input: ProductInput, ip: string | null) {
  const before = await getProduct(db, id);
  if (before.productTypeId !== input.productTypeId) await ensureProductType(db, input.productTypeId);
  await db
    .transaction(async (tx) => {
      await tx.update(products).set(input).where(eq(products.id, id));
      await logActivity(tx, { userId: actor.id, action: 'update', entityType: 'product', entityId: id, oldValues: before, newValues: input, ipAddress: ip });
    })
    .catch(duplicate);
  return getProduct(db, id);
}

export async function setProductActive(db: Db, actor: Actor, id: number, isActive: boolean, ip: string | null) {
  await getProduct(db, id);
  await db.transaction(async (tx) => {
    await tx.update(products).set({ isActive }).where(eq(products.id, id));
    await logActivity(tx, {
      userId: actor.id,
      action: isActive ? 'activate' : 'deactivate',
      entityType: 'product',
      entityId: id,
      newValues: { isActive },
      ipAddress: ip,
    });
  });
  return getProduct(db, id);
}
