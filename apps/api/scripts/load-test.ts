/**
 * Uji beban: 50.000 unit dalam satu project.
 * Mengukur: import Excel (baca file + simpan), daftar unit, antrian lini produksi, aktivasi massal,
 * dashboard, dan export Excel.
 *
 * Jalankan di database TEST (bukan data asli):
 *   pnpm --filter @manpro/api load-test
 */
import ExcelJS from 'exceljs';
import { mkdir, rm, stat } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { Writable } from 'node:stream';
import { sql } from 'drizzle-orm';
import { decodeId } from '../src/lib/public-id.js';

const N = Number(process.env.LOAD_UNITS ?? 50_000);

const { db, pool } = await import('../src/db/index.js');
const { runMigrations } = await import('../src/db/migrator.js');
const { seedDivisions, seedSuperAdmin } = await import('../src/db/seed-data.js');
const { seedMasterData } = await import('../src/db/seed-master.js');
const { createProject, addProjectItem } = await import('../src/services/projects.js');
const { addUnits, listUnits } = await import('../src/services/units.js');
const { workQueue, workQueueIds } = await import('../src/services/work.js');
const { bulkActivate } = await import('../src/services/activation.js');
const { getDashboard } = await import('../src/services/dashboard.js');
const { exportProjectUnits } = await import('../src/services/export.js');
const { clients, vendors, products, productTypes, users, activationTypes } = await import('../src/db/schema.js');

const results: [string, string][] = [];
async function time<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const t = performance.now();
  const r = await fn();
  const ms = performance.now() - t;
  results.push([label, ms > 2000 ? `${(ms / 1000).toFixed(1)} detik` : `${Math.round(ms)} ms`]);
  console.log(`${label}: ${results.at(-1)![1]}`);
  return r;
}

// ---- Siapkan database bersih ------------------------------------------------
if (!process.env.DATABASE_URL?.includes('test')) throw new Error('Jalankan hanya di database test (DATABASE_URL harus mengandung "test")');
await runMigrations();
const tables = (await db.execute(sql`SHOW TABLES`))[0] as unknown as Record<string, string>[];
await db.execute(sql`SET FOREIGN_KEY_CHECKS = 0`);
for (const t of tables) {
  const name = Object.values(t)[0]!;
  if (name !== '__drizzle_migrations') await db.execute(sql.raw(`TRUNCATE TABLE \`${name}\``));
}
await db.execute(sql`SET FOREIGN_KEY_CHECKS = 1`);
await seedDivisions(db);
const adminId = await seedSuperAdmin(db, 'admin', 'admin12345');
await seedMasterData(db);
const actor = { id: adminId, role: 'super_admin' as const, divisionId: null, divisionCode: null };
void users;

const [laptop] = await db.select().from(productTypes).where(sql`${productTypes.code} = 'LAPTOP'`);
const [c] = await db.insert(clients).values({ name: 'Dinas Uji Beban', type: 'dinas' });
const [v] = await db.insert(vendors).values({ name: 'Vendor Uji Beban', type: 'supplier' });
const [p] = await db.insert(products).values({ productTypeId: laptop!.id, brand: 'Lenovo', model: 'Uji Beban', partNumber: 'LOAD-1' });
const project = await createProject(db, actor, { name: 'Uji Beban', clientId: c.insertId, poNumber: null, targetDate: null, picUserId: null, shippingAddress: null, notes: null, qcMode: 'per_unit', lotSize: null, samplePercent: null, maxSampleFail: null }, null);
const projectId = decodeId('project', project.id);
const withItem = await addProjectItem(db, actor, projectId, { productId: p.insertId, vendorId: v.insertId, quantity: N, optionalStages: [], accessories: [] }, null);
const itemId = withItem.items[0]!.id;

// ---- File Excel 50.000 baris -------------------------------------------------
await mkdir('storage-test', { recursive: true });
const file = 'storage-test/load-test.xlsx';
await time(`Buat file Excel ${N.toLocaleString('id-ID')} baris`, async () => {
  const wb = new ExcelJS.stream.xlsx.WorkbookWriter({ filename: file });
  const ws = wb.addWorksheet('Unit');
  ws.addRow(['serial_number']).commit();
  for (let i = 1; i <= N; i++) ws.addRow([`LOAD-${String(i).padStart(6, '0')}`]).commit();
  ws.commit();
  await wb.commit();
});
console.log(`  ukuran file: ${((await stat(file)).size / 1024 / 1024).toFixed(1)} MB`);

const rows = await time('Baca file Excel', async () => {
  const out: { row: number; serialNumber: string }[] = [];
  const reader = new ExcelJS.stream.xlsx.WorkbookReader(file, { sharedStrings: 'cache', styles: 'ignore', worksheets: 'emit' });
  for await (const sheet of reader) {
    for await (const r of sheet) if (r.number > 1) out.push({ row: r.number, serialNumber: String((r.values as unknown[])[1]) });
    break;
  }
  return out;
});

const inserted = await time(`Simpan ${N.toLocaleString('id-ID')} unit (batch 1.000)`, () => addUnits(db, actor, projectId, itemId, rows));
if (inserted.inserted !== N) throw new Error(`Hanya ${inserted.inserted} unit masuk: ${JSON.stringify(inserted.errors.slice(0, 3))}`);

await time('Import ulang file yang sama (semua SN ganda terdeteksi)', async () => {
  const r = await addUnits(db, actor, projectId, itemId, rows.slice(0, 5000));
  if (r.errors.length !== 5000) throw new Error('Duplikat tidak terdeteksi');
});

// ---- Query harian ------------------------------------------------------------
await time('Daftar unit halaman 1 (50 baris)', () => listUnits(db, projectId, { page: 1, pageSize: 50 }));
await time('Cari 1 SN di daftar unit', () => listUnits(db, projectId, { page: 1, pageSize: 50, search: 'LOAD-049999' }));
await time('Daftar unit halaman terakhir', () => listUnits(db, projectId, { page: Math.ceil(N / 50), pageSize: 50 }));
await time('Antrian lini aktivasi', () => workQueue(db, 'activation', { projectId: projectId, page: 1, pageSize: 50 }));

// ---- Aktivasi massal 5.000 unit tanpa key & dengan key --------------------------
const [win] = await db.select().from(activationTypes).where(sql`${activationTypes.name} = 'Windows 11 Pro OEM'`);
const ids = await workQueueIds(db, 'activation', projectId, 5000);
await time('Aktivasi massal 5.000 unit + pindah ke QC', () =>
  bulkActivate(db, actor, { unitIds: ids, activationTypeId: win!.id, softwareId: null, softwareVersion: null, withKey: false, complete: true }),
);

await time('Dashboard', () => getDashboard(db));

await time(`Export Excel ${N.toLocaleString('id-ID')} unit`, async () => {
  const { stream } = await exportProjectUnits(db, projectId);
  let bytes = 0;
  await new Promise<void>((resolve, reject) => {
    stream.pipe(
      new Writable({
        write(chunk, _enc, cb) {
          bytes += chunk.length;
          cb();
        },
      }),
    );
    stream.on('end', resolve);
    stream.on('error', reject);
  });
  console.log(`  ukuran export: ${(bytes / 1024 / 1024).toFixed(1)} MB`);
});

const mem = process.memoryUsage();
results.push(['Memori maksimal proses', `${Math.round(mem.rss / 1024 / 1024)} MB`]);
console.log('\n| Pengujian | Waktu |\n|---|---|');
for (const [k, v] of results) console.log(`| ${k} | ${v} |`);

await rm(file, { force: true });
await pool.end();
