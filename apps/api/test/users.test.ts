import type { FastifyInstance } from 'fastify';
import { desc, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db, pool } from '../src/db/index.js';
import { activityLogs } from '../src/db/schema.js';
import { ADMIN, divisionId, login, setupTestApp } from './helpers.js';

type Headers = Record<string, string>;

let app: FastifyInstance;
let admin: Headers;
let qcId: number;
let packingId: number;

async function createUser(headers: Headers, payload: Record<string, unknown>) {
  return app.inject({ method: 'POST', url: '/api/users', headers, payload });
}

beforeAll(async () => {
  app = await setupTestApp();
  const res = await login(app, ADMIN.username, ADMIN.password);
  expect(res.status).toBe(200);
  admin = res.headers;
  qcId = await divisionId(app, admin, 'QC');
  packingId = await divisionId(app, admin, 'PACKING');
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

describe('login', () => {
  it('password salah ditolak', async () => {
    const res = await login(app, ADMIN.username, 'salah-password');
    expect(res.status).toBe(401);
  });

  it('endpoint butuh login', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/me' });
    expect(res.statusCode).toBe(401);
  });

  it('/api/me mengembalikan data user login', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/me', headers: admin });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ username: 'admin', role: 'super_admin' });
  });
});

describe('manajemen user per divisi', () => {
  let leaderQc: Headers;
  let staffQcId: string;

  beforeAll(async () => {
    expect((await createUser(admin, { name: 'Leader QC', username: 'leader.qc', password: 'password123', role: 'leader', divisionId: qcId })).statusCode).toBe(201);
    expect((await createUser(admin, { name: 'Leader Packing', username: 'leader.packing', password: 'password123', role: 'leader', divisionId: packingId })).statusCode).toBe(201);
    leaderQc = (await login(app, 'leader.qc', 'password123')).headers;
  });

  it('leader bisa menambah staff di divisinya', async () => {
    const res = await createUser(leaderQc, { name: 'Staff QC', username: 'staff.qc', password: 'password123', role: 'staff', divisionId: qcId });
    expect(res.statusCode).toBe(201);
    staffQcId = res.json().id;
  });

  it('leader tidak bisa menambah user di divisi lain', async () => {
    const res = await createUser(leaderQc, { name: 'X', username: 'staff.x', password: 'password123', role: 'staff', divisionId: packingId });
    expect(res.statusCode).toBe(403);
  });

  it('leader tidak bisa membuat leader', async () => {
    const res = await createUser(leaderQc, { name: 'X', username: 'leader.x', password: 'password123', role: 'leader', divisionId: qcId });
    expect(res.statusCode).toBe(403);
  });

  it('leader hanya melihat user divisinya', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/users', headers: leaderQc });
    expect(res.statusCode).toBe(200);
    const usernames = (res.json().data as { username: string }[]).map((u) => u.username).sort();
    expect(usernames).toEqual(['leader.qc', 'staff.qc']);
  });

  it('username duplikat ditolak', async () => {
    const res = await createUser(admin, { name: 'Dup', username: 'staff.qc', password: 'password123', role: 'staff', divisionId: qcId });
    expect(res.statusCode).toBe(409);
  });

  it('staff tidak bisa membuka manajemen user', async () => {
    const staff = (await login(app, 'staff.qc', 'password123')).headers;
    const res = await app.inject({ method: 'GET', url: '/api/users', headers: staff });
    expect(res.statusCode).toBe(403);
  });

  it('leader tidak bisa mengubah leader divisi lain', async () => {
    const list = await app.inject({ method: 'GET', url: '/api/users?search=leader.packing', headers: admin });
    const target = list.json().data[0].id as string;
    const res = await app.inject({ method: 'PATCH', url: `/api/users/${target}/active`, headers: leaderQc, payload: { isActive: false } });
    expect(res.statusCode).toBe(404);
  });

  it('user nonaktif langsung keluar dan tidak bisa login', async () => {
    const staff = (await login(app, 'staff.qc', 'password123')).headers;
    const res = await app.inject({ method: 'PATCH', url: `/api/users/${staffQcId}/active`, headers: leaderQc, payload: { isActive: false } });
    expect(res.statusCode).toBe(200);
    expect(res.json().isActive).toBe(false);

    const me = await app.inject({ method: 'GET', url: '/api/me', headers: staff });
    expect(me.statusCode).toBe(401);
    expect((await login(app, 'staff.qc', 'password123')).status).not.toBe(200);
  });

  it('reset password: password lama tidak berlaku', async () => {
    await app.inject({ method: 'PATCH', url: `/api/users/${staffQcId}/active`, headers: leaderQc, payload: { isActive: true } });
    const res = await app.inject({ method: 'POST', url: `/api/users/${staffQcId}/reset-password`, headers: leaderQc, payload: { password: 'passwordbaru1' } });
    expect(res.statusCode).toBe(204);
    expect((await login(app, 'staff.qc', 'password123')).status).toBe(401);
    expect((await login(app, 'staff.qc', 'passwordbaru1')).status).toBe(200);
  });

  it('perubahan tercatat di audit trail tanpa password', async () => {
    const logs = await db
      .select()
      .from(activityLogs)
      .where(eq(activityLogs.entityId, staffQcId))
      .orderBy(desc(activityLogs.id));
    const actions = logs.map((l) => l.action);
    expect(actions).toEqual(expect.arrayContaining(['create', 'deactivate', 'activate', 'reset_password']));
    expect(JSON.stringify(logs)).not.toContain('password123');
  });

  it('validasi input: role staff wajib punya divisi', async () => {
    const res = await createUser(admin, { name: 'X', username: 'tanpa.divisi', password: 'password123', role: 'staff', divisionId: null });
    expect(res.statusCode).toBe(400);
  });
});

describe('profil & password sendiri', () => {
  it('staff bisa ubah nama & password sendiri; session lain keluar, session ini tetap', async () => {
    const created = await createUser(admin, { name: 'Profil Test', username: 'profil.test', password: 'awal12345', role: 'staff', divisionId: qcId });
    expect(created.statusCode).toBe(201);
    const a = (await login(app, 'profil.test', 'awal12345')).headers;
    const b = (await login(app, 'profil.test', 'awal12345')).headers;

    const upd = await app.inject({ method: 'PUT', url: '/api/me', headers: a, payload: { name: 'Profil Baru' } });
    expect(upd.statusCode).toBe(204);
    expect((await app.inject({ method: 'GET', url: '/api/me', headers: a })).json().name).toBe('Profil Baru');

    const wrong = await app.inject({ method: 'POST', url: '/api/me/password', headers: a, payload: { currentPassword: 'salah123', newPassword: 'baru12345' } });
    expect(wrong.statusCode).toBe(400);
    const same = await app.inject({ method: 'POST', url: '/api/me/password', headers: a, payload: { currentPassword: 'awal12345', newPassword: 'awal12345' } });
    expect(same.statusCode).toBe(400);

    const ok = await app.inject({ method: 'POST', url: '/api/me/password', headers: a, payload: { currentPassword: 'awal12345', newPassword: 'baru12345' } });
    expect(ok.statusCode).toBe(204);
    expect((await app.inject({ method: 'GET', url: '/api/me', headers: a })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/api/me', headers: b })).statusCode).toBe(401);
    expect((await login(app, 'profil.test', 'awal12345')).status).toBe(401);
    expect((await login(app, 'profil.test', 'baru12345')).status).toBe(200);

    const [log] = await db.select().from(activityLogs).where(eq(activityLogs.action, 'change_password')).orderBy(desc(activityLogs.id)).limit(1);
    expect(log?.entityId).toBe(created.json().id);
  });
});

describe('batas percobaan login', () => {
  it('5 kali salah → dikunci (429), walaupun password berikutnya benar', async () => {
    const created = await createUser(admin, { name: 'Kunci Test', username: 'kunci.test', password: 'benar12345', role: 'staff', divisionId: qcId });
    expect(created.statusCode).toBe(201);
    for (let i = 0; i < 5; i++) expect((await login(app, 'kunci.test', 'salah-terus')).status).toBe(401);
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/username',
      headers: { origin: 'http://localhost:5173' },
      payload: { username: 'kunci.test', password: 'benar12345' },
    });
    expect(res.statusCode).toBe(429);
    expect(res.json().message).toContain('Terlalu banyak percobaan');
    // User lain tidak ikut terkunci.
    expect((await login(app, ADMIN.username, ADMIN.password)).status).toBe(200);
  });

  it('respons API membawa header keamanan', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/me', headers: admin });
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('DENY');
    expect(res.headers['cache-control']).toBe('no-store');
  });
});
