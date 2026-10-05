import {
  canAssign,
  canManageUser,
  canViewUser,
  validateRoleDivision,
  type Actor,
  type ChangePasswordInput,
  type CreateUserInput,
  type ListUsersQuery,
  type Paginated,
  type UpdateProfileInput,
  type UpdateUserInput,
  type UserDto,
} from '@manpro/shared';
import { and, count, desc, eq, like, ne, or, type SQL } from 'drizzle-orm';
import { hashPassword, verifyPassword } from '../auth.js';
import type { Db } from '../db/index.js';
import { accounts, divisions, sessions, users } from '../db/schema.js';
import { logActivity } from '../lib/audit.js';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors.js';

const userColumns = {
  id: users.id,
  name: users.name,
  username: users.username,
  role: users.role,
  divisionId: users.divisionId,
  divisionCode: divisions.code,
  divisionName: divisions.name,
  isActive: users.isActive,
  createdAt: users.createdAt,
};

interface UserRow extends Omit<UserDto, 'username' | 'createdAt'> {
  username: string | null;
  createdAt: Date;
}

function toDto(row: UserRow): UserDto {
  return { ...row, username: row.username ?? '', createdAt: row.createdAt.toISOString() };
}

/** Filter daftar user sesuai hak lihat actor. */
function visibilityFilter(actor: Actor): SQL | undefined {
  switch (actor.role) {
    case 'super_admin':
    case 'manager':
      return undefined;
    case 'leader':
      return actor.divisionId === null ? eq(users.id, actor.id) : eq(users.divisionId, actor.divisionId);
    case 'staff':
      return eq(users.id, actor.id);
  }
}

export async function listUsers(db: Db, actor: Actor, q: ListUsersQuery): Promise<Paginated<UserDto>> {
  const filters: (SQL | undefined)[] = [visibilityFilter(actor)];
  if (q.divisionId) filters.push(eq(users.divisionId, q.divisionId));
  if (q.search) {
    const s = `%${q.search}%`;
    filters.push(or(like(users.name, s), like(users.username, s)));
  }
  const where = and(...filters);

  const [rows, [totalRow]] = await Promise.all([
    db
      .select(userColumns)
      .from(users)
      .leftJoin(divisions, eq(users.divisionId, divisions.id))
      .where(where)
      .orderBy(desc(users.isActive), users.name)
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize),
    db.select({ total: count() }).from(users).where(where),
  ]);

  return { data: rows.map(toDto), total: totalRow?.total ?? 0, page: q.page, pageSize: q.pageSize };
}

export async function getUser(db: Db, id: string): Promise<UserDto | null> {
  const [row] = await db
    .select(userColumns)
    .from(users)
    .leftJoin(divisions, eq(users.divisionId, divisions.id))
    .where(eq(users.id, id));
  return row ? toDto(row) : null;
}

async function ensureDivisionExists(db: Db, divisionId: number | null) {
  if (divisionId === null) return;
  const [d] = await db.select({ id: divisions.id }).from(divisions).where(eq(divisions.id, divisionId));
  if (!d) throw badRequest('Divisi tidak ditemukan');
}

function checkAssignment(actor: Actor, role: UserDto['role'], divisionId: number | null) {
  const invalid = validateRoleDivision(role, divisionId);
  if (invalid) throw badRequest(invalid);
  if (!canAssign(actor, role, divisionId)) throw forbidden('Anda tidak boleh memberi role atau divisi ini');
}

async function loadManageable(db: Db, actor: Actor, id: string): Promise<UserDto> {
  const target = await getUser(db, id);
  if (!target || !canViewUser(actor, target)) throw notFound('User tidak ditemukan');
  if (!canManageUser(actor, target)) throw forbidden('Anda tidak boleh mengubah user ini');
  return target;
}

export async function createUser(db: Db, actor: Actor, input: CreateUserInput, ip: string | null): Promise<UserDto> {
  checkAssignment(actor, input.role, input.divisionId);
  await ensureDivisionExists(db, input.divisionId);

  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.username, input.username));
  if (existing) throw conflict('Username sudah dipakai');

  const id = crypto.randomUUID();
  const passwordHash = await hashPassword(input.password);

  await db.transaction(async (tx) => {
    await tx.insert(users).values({
      id,
      name: input.name,
      email: `${input.username}@users.local`,
      username: input.username,
      displayUsername: input.username,
      role: input.role,
      divisionId: input.divisionId,
      createdBy: actor.id,
    });
    await tx.insert(accounts).values({
      id: crypto.randomUUID(),
      accountId: id,
      providerId: 'credential',
      userId: id,
      password: passwordHash,
    });
    await logActivity(tx, {
      userId: actor.id,
      action: 'create',
      entityType: 'user',
      entityId: id,
      newValues: { name: input.name, username: input.username, role: input.role, divisionId: input.divisionId },
      ipAddress: ip,
    });
  });

  return (await getUser(db, id))!;
}

export async function updateUser(db: Db, actor: Actor, id: string, input: UpdateUserInput, ip: string | null) {
  const target = await loadManageable(db, actor, id);
  checkAssignment(actor, input.role, input.divisionId);
  await ensureDivisionExists(db, input.divisionId);

  await db.transaction(async (tx) => {
    await tx.update(users).set(input).where(eq(users.id, id));
    await logActivity(tx, {
      userId: actor.id,
      action: 'update',
      entityType: 'user',
      entityId: id,
      oldValues: { name: target.name, role: target.role, divisionId: target.divisionId },
      newValues: input,
      ipAddress: ip,
    });
  });
  return (await getUser(db, id))!;
}

export async function setUserActive(db: Db, actor: Actor, id: string, isActive: boolean, ip: string | null) {
  const target = await loadManageable(db, actor, id);

  await db.transaction(async (tx) => {
    await tx.update(users).set({ isActive }).where(eq(users.id, id));
    // Nonaktif = langsung keluar dari semua perangkat.
    if (!isActive) await tx.delete(sessions).where(eq(sessions.userId, id));
    await logActivity(tx, {
      userId: actor.id,
      action: isActive ? 'activate' : 'deactivate',
      entityType: 'user',
      entityId: id,
      oldValues: { isActive: target.isActive },
      newValues: { isActive },
      ipAddress: ip,
    });
  });
  return (await getUser(db, id))!;
}

export async function resetUserPassword(db: Db, actor: Actor, id: string, password: string, ip: string | null) {
  await loadManageable(db, actor, id);
  const passwordHash = await hashPassword(password);

  await db.transaction(async (tx) => {
    await tx
      .update(accounts)
      .set({ password: passwordHash })
      .where(and(eq(accounts.userId, id), eq(accounts.providerId, 'credential')));
    await tx.delete(sessions).where(eq(sessions.userId, id));
    await logActivity(tx, {
      userId: actor.id,
      action: 'reset_password',
      entityType: 'user',
      entityId: id,
      ipAddress: ip,
    });
  });
}

/** User mengubah nama tampilannya sendiri. */
export async function updateOwnProfile(db: Db, actor: Actor, input: UpdateProfileInput, ip: string | null) {
  const [before] = await db.select({ name: users.name }).from(users).where(eq(users.id, actor.id));
  if (!before) throw notFound('User tidak ditemukan');
  await db.transaction(async (tx) => {
    await tx.update(users).set({ name: input.name }).where(eq(users.id, actor.id));
    await logActivity(tx, {
      userId: actor.id,
      action: 'update_profile',
      entityType: 'user',
      entityId: actor.id,
      oldValues: before,
      newValues: input,
      ipAddress: ip,
    });
  });
}

/**
 * User mengganti password sendiri. Password lama wajib benar.
 * Session di perangkat lain dikeluarkan; session yang sedang dipakai tetap login.
 */
export async function changeOwnPassword(db: Db, actor: Actor, currentSessionId: string | null, input: ChangePasswordInput, ip: string | null) {
  const [account] = await db
    .select({ id: accounts.id, password: accounts.password })
    .from(accounts)
    .where(and(eq(accounts.userId, actor.id), eq(accounts.providerId, 'credential')));
  if (!account?.password || !(await verifyPassword(account.password, input.currentPassword))) {
    throw badRequest('Password lama salah');
  }
  const passwordHash = await hashPassword(input.newPassword);
  await db.transaction(async (tx) => {
    await tx.update(accounts).set({ password: passwordHash }).where(eq(accounts.id, account.id));
    await tx
      .delete(sessions)
      .where(currentSessionId ? and(eq(sessions.userId, actor.id), ne(sessions.id, currentSessionId)) : eq(sessions.userId, actor.id));
    await logActivity(tx, { userId: actor.id, action: 'change_password', entityType: 'user', entityId: actor.id, ipAddress: ip });
  });
}
