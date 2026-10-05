import { eq } from 'drizzle-orm';
import { hashPassword } from '../auth.js';
import type { Db } from './index.js';
import { accounts, divisions, users } from './schema.js';

export const DIVISIONS = [
  { code: 'ADMIN', name: 'Admin Project', stage: null },
  { code: 'ASSEMBLING', name: 'Assembling', stage: 'assembling' },
  { code: 'ACTIVATION', name: 'Aktivasi', stage: 'activation' },
  { code: 'QC', name: 'QC', stage: 'qc' },
  { code: 'PACKING', name: 'Packing', stage: 'packing' },
  { code: 'LOGISTICS', name: 'Logistik', stage: 'shipping' },
] as const;

/** Mengisi divisi (idempoten). */
export async function seedDivisions(db: Db) {
  for (const d of DIVISIONS) {
    await db.insert(divisions).values(d).onDuplicateKeyUpdate({ set: { name: d.name, stage: d.stage } });
  }
}

/** Membuat akun Super Admin kalau belum ada. */
export async function seedSuperAdmin(db: Db, username: string, password: string) {
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.username, username));
  if (existing) return existing.id;

  const id = crypto.randomUUID();
  await db.insert(users).values({
    id,
    name: 'Super Admin',
    email: `${username}@users.local`,
    username,
    displayUsername: username,
    role: 'super_admin',
  });
  await db.insert(accounts).values({
    id: crypto.randomUUID(),
    accountId: id,
    providerId: 'credential',
    userId: id,
    password: await hashPassword(password),
  });
  return id;
}
