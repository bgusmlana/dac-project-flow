import {
  masterSchemas,
  type Actor,
  type ListMasterQuery,
  type MasterDto,
  type MasterInput,
  type MasterKind,
  type Paginated,
} from '@manpro/shared';
import { and, asc, count, eq, like, type SQL } from 'drizzle-orm';
import type { Db } from '../db/index.js';
import { activationTypes, clients, componentCategories, couriers, software, vendors } from '../db/schema.js';
import { logActivity } from '../lib/audit.js';
import { conflict, isDuplicateKeyError, notFound } from '../lib/errors.js';

/**
 * Semua tabel master sederhana punya kolom id, name, is_active, created_at, updated_at.
 * Service ini memperlakukannya sama; untuk query cukup memakai tipe salah satu tabel.
 */
type CommonTable = typeof couriers;

const TABLES: Record<MasterKind, { table: CommonTable; label: string }> = {
  clients: { table: clients as unknown as CommonTable, label: 'Client' },
  vendors: { table: vendors as unknown as CommonTable, label: 'Vendor' },
  couriers: { table: couriers, label: 'Ekspedisi' },
  'component-categories': { table: componentCategories as unknown as CommonTable, label: 'Kategori komponen' },
  'activation-types': { table: activationTypes as unknown as CommonTable, label: 'Jenis aktivasi' },
  software: { table: software as unknown as CommonTable, label: 'Software' },
};

export function isMasterKind(kind: string): kind is MasterKind {
  return kind in masterSchemas;
}

function toDto<K extends MasterKind>(row: Record<string, unknown>): MasterDto<K> {
  const { createdAt: _c, updatedAt: _u, ...rest } = row;
  return rest as MasterDto<K>;
}

export async function listMaster<K extends MasterKind>(db: Db, kind: K, q: ListMasterQuery): Promise<Paginated<MasterDto<K>>> {
  const { table } = TABLES[kind];
  const filters: (SQL | undefined)[] = [];
  if (!q.includeInactive) filters.push(eq(table.isActive, true));
  if (q.search) filters.push(like(table.name, `%${q.search}%`));
  const where = and(...filters);

  const [rows, [totalRow]] = await Promise.all([
    db
      .select()
      .from(table)
      .where(where)
      .orderBy(asc(table.name))
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize),
    db.select({ total: count() }).from(table).where(where),
  ]);
  return { data: rows.map((r) => toDto<K>(r)), total: totalRow?.total ?? 0, page: q.page, pageSize: q.pageSize };
}

async function getOne<K extends MasterKind>(db: Db, kind: K, id: number): Promise<MasterDto<K>> {
  const { table, label } = TABLES[kind];
  const [row] = await db.select().from(table).where(eq(table.id, id));
  if (!row) throw notFound(`${label} tidak ditemukan`);
  return toDto<K>(row);
}

function duplicate(kind: MasterKind, error: unknown): never {
  if (isDuplicateKeyError(error)) throw conflict(`${TABLES[kind].label} dengan nama ini sudah ada`);
  throw error;
}

export async function createMaster<K extends MasterKind>(
  db: Db,
  actor: Actor,
  kind: K,
  input: MasterInput<K>,
  ip: string | null,
): Promise<MasterDto<K>> {
  const { table } = TABLES[kind];
  const id = await db
    .transaction(async (tx) => {
      const [res] = await tx.insert(table).values(input as never);
      await logActivity(tx, { userId: actor.id, action: 'create', entityType: kind, entityId: res.insertId, newValues: input, ipAddress: ip });
      return res.insertId;
    })
    .catch((e) => duplicate(kind, e));
  return getOne(db, kind, id);
}

export async function updateMaster<K extends MasterKind>(
  db: Db,
  actor: Actor,
  kind: K,
  id: number,
  input: MasterInput<K>,
  ip: string | null,
): Promise<MasterDto<K>> {
  const { table } = TABLES[kind];
  const before = await getOne(db, kind, id);
  await db
    .transaction(async (tx) => {
      await tx.update(table).set(input as never).where(eq(table.id, id));
      await logActivity(tx, { userId: actor.id, action: 'update', entityType: kind, entityId: id, oldValues: before, newValues: input, ipAddress: ip });
    })
    .catch((e) => duplicate(kind, e));
  return getOne(db, kind, id);
}

export async function setMasterActive<K extends MasterKind>(
  db: Db,
  actor: Actor,
  kind: K,
  id: number,
  isActive: boolean,
  ip: string | null,
): Promise<MasterDto<K>> {
  const { table } = TABLES[kind];
  await getOne(db, kind, id);
  await db.transaction(async (tx) => {
    await tx.update(table).set({ isActive }).where(eq(table.id, id));
    await logActivity(tx, {
      userId: actor.id,
      action: isActive ? 'activate' : 'deactivate',
      entityType: kind,
      entityId: id,
      newValues: { isActive },
      ipAddress: ip,
    });
  });
  return getOne(db, kind, id);
}
