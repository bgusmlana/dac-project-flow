import type { FastifyInstance } from 'fastify';
import { sql } from 'drizzle-orm';
import { buildApp } from '../src/app.js';
import { db } from '../src/db/index.js';
import { runMigrations } from '../src/db/migrator.js';
import { seedDivisions, seedSuperAdmin } from '../src/db/seed-data.js';
import { seedMasterData } from '../src/db/seed-master.js';

export const ADMIN = { username: 'admin', password: 'admin12345' };

const TABLES = [
  'secret_access_logs',
  'import_jobs',
  'project_stage_counters',
  'unit_stage_logs',
  'unit_components',
  'installations',
  'packages',
  'shipments',
  'attachments',
  'qc_inspection_results',
  'qc_inspections',
  'lot_samples',
  'lots',
  'activations',
  'license_keys',
  'unit_accessories',
  'units',
  'project_items',
  'projects',
  'activity_logs',
  'sessions',
  'accounts',
  'verifications',
  'users',
  'divisions',
  'products',
  'qc_template_items',
  'qc_templates',
  'custom_field_definitions',
  'product_type_activation_types',
  'product_type_component_categories',
  'product_type_stages',
  'product_types',
  'clients',
  'vendors',
  'couriers',
  'component_categories',
  'activation_types',
  'software',
];

/** Siapkan database test yang bersih + app Fastify. */
export async function setupTestApp(): Promise<FastifyInstance> {
  await runMigrations();
  await db.execute(sql`SET FOREIGN_KEY_CHECKS = 0`);
  for (const t of TABLES) await db.execute(sql.raw(`TRUNCATE TABLE ${t}`));
  await db.execute(sql`SET FOREIGN_KEY_CHECKS = 1`);
  await seedDivisions(db);
  await seedSuperAdmin(db, ADMIN.username, ADMIN.password);
  await seedMasterData(db);
  const app = await buildApp();
  await app.ready();
  return app;
}

/** Login dan kembalikan header cookie untuk request berikutnya. */
export async function login(app: FastifyInstance, username: string, password: string) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-in/username',
    headers: { origin: 'http://localhost:5173' },
    payload: { username, password },
  });
  const setCookie = res.headers['set-cookie'];
  const cookies = (Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : []).map((c) => c.split(';')[0]);
  return { status: res.statusCode, headers: { cookie: cookies.join('; '), origin: 'http://localhost:5173' } };
}

export async function divisionId(app: FastifyInstance, headers: Record<string, string>, code: string) {
  const res = await app.inject({ method: 'GET', url: '/api/divisions', headers });
  const d = (res.json() as { id: number; code: string }[]).find((x) => x.code === code);
  if (!d) throw new Error(`Divisi ${code} tidak ada`);
  return d.id;
}

/** Susun body multipart/form-data untuk app.inject. */
export function multipartBody(field: string, filename: string, data: Buffer, contentType = 'application/octet-stream') {
  const boundary = `----manpro${Date.now()}`;
  const crlf = String.fromCharCode(13, 10);
  const head = `--${boundary}${crlf}Content-Disposition: form-data; name="${field}"; filename="${filename}"${crlf}Content-Type: ${contentType}${crlf}${crlf}`;
  const body = Buffer.concat([Buffer.from(head), data, Buffer.from(`${crlf}--${boundary}--${crlf}`)]);
  return { body, contentType: `multipart/form-data; boundary=${boundary}` };
}

/** Tunggu sampai kondisi terpenuhi (untuk proses queue). */
export async function waitFor<T>(fn: () => Promise<T>, done: (v: T) => boolean, timeoutMs = 60000): Promise<T> {
  const start = Date.now();
  for (;;) {
    const v = await fn();
    if (done(v)) return v;
    if (Date.now() - start > timeoutMs) throw new Error('Waktu tunggu habis');
    await new Promise((r) => setTimeout(r, 200));
  }
}
