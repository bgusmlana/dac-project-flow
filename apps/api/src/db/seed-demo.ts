// CLI: pnpm db:seed-demo   (biasanya lewat: pnpm db:demo = reset + seed + seed-demo)
// Data contoh untuk mencoba aplikasi di laptop:
// - akun per divisi (password demo12345; Super Admin admin / admin12345)
// - 1 project 100 unit laptop yang disimulasikan berjalan 8 hari kerja lewat logika aplikasi yang sama
//   dengan pemakaian sungguhan (tiap langkah dikerjakan petugas divisinya), dengan sisa antrian di setiap tahap.
// JANGAN dipakai di server production.
import { DIVISION_CODES, type Actor, type DivisionCode } from '@manpro/shared';
import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import { env } from '../env.js';
import { addDays, localToday } from '../lib/time.js';
import { completeAssembling, addComponent } from '../services/assembling.js';
import { bulkActivate, completeActivation, importKeys } from '../services/activation.js';
import { createPackage, packUnits, sealPackage } from '../services/packing.js';
import { addProjectItem, createProject } from '../services/projects.js';
import { getQcForm, inspect } from '../services/qc.js';
import { addPackages, createShipment, deliverShipment, shipShipment } from '../services/shipping.js';
import { addUnits } from '../services/units.js';
import { createUser } from '../services/users.js';
import { db, pool } from './index.js';
import { activationTypes, clients, componentCategories, couriers, divisions, packages, products, productTypes, units, users, vendors } from './schema.js';
import { seedDivisions, seedSuperAdmin } from './seed-data.js';
import { seedMasterData } from './seed-master.js';
import { decodeId } from '../lib/public-id.js';

if (env.NODE_ENV === 'production') throw new Error('Seed demo tidak boleh dijalankan di production');

export const DEMO_PASSWORD = 'demo12345';
const UNIT_COUNT = 100;
const START = -8; // project dimulai 8 hari lalu
const DEADLINE_DAYS = 14; // deadline 2 minggu sejak project dimulai

// ---------------------------------------------------------------------------
// Jam simulasi: setiap langkah dijalankan sekarang, lalu semua waktu yang tercatat
// selama langkah itu digeser ke hari & jam kerja yang disimulasikan.
// ---------------------------------------------------------------------------

/** Waktu (UTC) untuk hari ke-`day` relatif hari ini, jam kerja lokal hh:mm. */
function clock(day: number, hh: number, mm = 0): Date {
  const date = addDays(localToday(), day);
  return new Date(`${date}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00${env.APP_TZ_OFFSET}`);
}

const [colRows] = await pool.query(
  `SELECT table_name AS t, column_name AS c FROM information_schema.columns
   WHERE table_schema = DATABASE() AND data_type IN ('timestamp', 'datetime') AND column_name NOT LIKE '%expires%'`,
);
const timeCols = colRows as { t: string; c: string }[];

async function at<T>(when: Date, fn: () => Promise<T>): Promise<T> {
  // Kalau dijalankan pagi hari, pekerjaan "hari ini" yang jamnya belum lewat dicatat sedikit sebelum sekarang.
  if (when.getTime() > Date.now() - 60_000) when = new Date(Date.now() - 60_000);
  const start = new Date(Date.now() - 1000);
  const result = await fn();
  for (const { t, c } of timeCols) {
    await pool.query(`UPDATE \`${t}\` SET \`${c}\` = TIMESTAMPADD(MICROSECOND, TIMESTAMPDIFF(MICROSECOND, ?, \`${c}\`), ?) WHERE \`${c}\` >= ?`, [
      start,
      when,
      start,
    ]);
  }
  return result;
}

/** Penunjuk jam kerja per petugas per hari (mulai 08:00, maju sekian menit per pekerjaan). */
function workday(day: number, startHour = 8) {
  let minutes = startHour * 60 + Math.floor(Math.random() * 15);
  return (stepMinutes: number) => {
    const t = clock(day, Math.floor(minutes / 60), minutes % 60);
    minutes += stepMinutes + Math.floor(Math.random() * 4);
    if (minutes > 16 * 60 + 30) minutes = 16 * 60 + 30; // jangan lewat jam pulang
    return t;
  };
}

// ---------------------------------------------------------------------------
// Akun
// ---------------------------------------------------------------------------
await seedDivisions(db);
const adminId = await seedSuperAdmin(db, 'admin', 'admin12345');
await seedMasterData(db);
const superAdmin: Actor = { id: adminId, role: 'super_admin', divisionId: null, divisionCode: null };

const divs = await db.select().from(divisions);
const divOf = (code: DivisionCode) => divs.find((d) => d.code === code)!;

async function ensureUser(username: string, name: string, role: 'manager' | 'leader' | 'staff', code: DivisionCode | null): Promise<Actor> {
  const divisionId = code ? divOf(code).id : null;
  let [u] = await db.select({ id: users.id }).from(users).where(eq(users.username, username));
  if (!u) u = await createUser(db, superAdmin, { name, username, password: DEMO_PASSWORD, role, divisionId }, null);
  return { id: u.id, role, divisionId, divisionCode: code };
}

const staff = {} as Record<DivisionCode, Actor>;
const leader = {} as Record<DivisionCode, Actor>;
await at(clock(START - 3, 9), async () => {
  await ensureUser('manager', 'Manager Demo', 'manager', null);
  for (const code of DIVISION_CODES) {
    const d = divOf(code);
    const key = code.toLowerCase();
    leader[code] = await ensureUser(`leader.${key}`, `Leader ${d.name}`, 'leader', code);
    staff[code] = await ensureUser(`staff.${key}`, `Staff ${d.name}`, 'staff', code);
  }
});
// Staff kedua di divisi yang ramai, supaya rekap per petugas terlihat.
const staff2 = await at(clock(START - 3, 10), async () => ({
  ASSEMBLING: await ensureUser('rudi.assembling', 'Rudi Hartono', 'staff', 'ASSEMBLING'),
  QC: await ensureUser('dewi.qc', 'Dewi Lestari', 'staff', 'QC'),
  PACKING: await ensureUser('agus.packing', 'Agus Setiawan', 'staff', 'PACKING'),
}));

// ---------------------------------------------------------------------------
// Master data project
// ---------------------------------------------------------------------------
await db.insert(clients).values({ name: 'Dinas Pendidikan Provinsi Demo', type: 'dinas', phone: '021-5550123', address: 'Jl. Merdeka No. 10, Kota Demo' }).onDuplicateKeyUpdate({ set: { type: 'dinas' } });
const [client] = await db.select().from(clients).where(eq(clients.name, 'Dinas Pendidikan Provinsi Demo'));
await db.insert(vendors).values({ name: 'PT Distributor Komputer Demo', type: 'supplier' }).onDuplicateKeyUpdate({ set: { type: 'supplier' } });
const [vendor] = await db.select().from(vendors).where(eq(vendors.name, 'PT Distributor Komputer Demo'));
const [laptop] = await db.select().from(productTypes).where(eq(productTypes.code, 'LAPTOP'));
await db
  .insert(products)
  .values({ productTypeId: laptop!.id, brand: 'Lenovo', model: 'ThinkPad E14 Gen 6', partNumber: '21M7000XID', specification: 'Intel Core i5-1335U, 8GB (upgrade 16GB), SSD 512GB, 14" WUXGA' })
  .onDuplicateKeyUpdate({ set: { model: 'ThinkPad E14 Gen 6' } });
const [product] = await db.select().from(products).where(eq(products.partNumber, '21M7000XID'));
const cats = await db.select().from(componentCategories).where(inArray(componentCategories.name, ['RAM', 'SSD']));
const catId = (n: string) => cats.find((c) => c.name === n)!.id;
const [win] = await db.select().from(activationTypes).where(eq(activationTypes.name, 'Windows 11 Pro OEM'));
const courierList = await db.select().from(couriers);
const courierId = (n: string) => courierList.find((c) => c.name === n)!.id;

// ---------------------------------------------------------------------------
// Hari 1: Admin Project membuat project & mendaftarkan 100 unit; Aktivasi mengimpor license key.
// ---------------------------------------------------------------------------
const pad = (n: number, w = 4) => String(n).padStart(w, '0');
const sn = (i: number) => `PF5K${pad(i)}`;

const project = await at(clock(START, 8, 30), () =>
  createProject(
    db,
    staff.ADMIN,
    {
      name: 'Pengadaan Laptop SMA Negeri 2026 (Demo)',
      clientId: client!.id,
      poNumber: 'PO/DISDIK/2026/0917',
      targetDate: addDays(localToday(), START + DEADLINE_DAYS),
      picUserId: leader.ADMIN.id,
      shippingAddress: 'Gudang Dinas Pendidikan Provinsi Demo, Jl. Merdeka No. 10, Kota Demo',
      notes: 'Upgrade RAM ke 16GB sebelum aktivasi. Kirim bertahap per 20 unit.',
      qcMode: 'per_unit',
      lotSize: null,
      samplePercent: null,
      maxSampleFail: null,
    },
    null,
  ),
);
const projectId = decodeId('project', project.id);
const withItem = await at(clock(START, 8, 45), () =>
  addProjectItem(db, staff.ADMIN, projectId, { productId: product!.id, vendorId: vendor!.id, quantity: UNIT_COUNT, optionalStages: ['assembling'], accessories: ['Charger / Adaptor'] }, null),
);
const itemId = withItem.items[0]!.id;
await at(clock(START, 9, 10), () =>
  addUnits(
    db,
    staff.ADMIN,
    projectId,
    itemId,
    Array.from({ length: UNIT_COUNT }, (_, i) => ({
      row: i + 1,
      serialNumber: sn(i + 1),
      accessories: [{ name: 'Charger / Adaptor', serialNumber: `8SSA10M${pad(i + 1, 5)}` }],
    })),
  ),
);
await at(clock(START, 10, 0), () =>
  importKeys(
    db,
    leader.ACTIVATION,
    { activationTypeId: win!.id, softwareId: null, projectId: null, validUntil: null, keys: Array.from({ length: 130 }, (_, i) => `W11PO-DEMO${pad(i, 1)}-7K9QX-M4TRB-${pad(i + 1, 5)}`) },
    null,
  ),
);

const unitRows = await db.select({ id: units.id, sn: units.serialNumber }).from(units).where(eq(units.projectId, projectId)).orderBy(asc(units.id));
const idOf = (i: number) => unitRows[i - 1]!.id;
const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, k) => a + k);

// ---------------------------------------------------------------------------
// Langkah per tahap
// ---------------------------------------------------------------------------

/** Assembling: upgrade RAM 16GB + catat SSD bawaan, dibagi dua teknisi. */
async function assemble(day: number, nums: number[], note: string | null = null) {
  const a = workday(day);
  const b = workday(day);
  for (const [k, i] of nums.entries()) {
    const who = k % 2 === 0 ? staff.ASSEMBLING : staff2.ASSEMBLING;
    const t = (k % 2 === 0 ? a : b)(18);
    await at(t, async () => {
      await addComponent(db, who, idOf(i), { componentCategoryId: catId('RAM'), brand: 'SK Hynix', model: 'DDR5 16GB 5600 SODIMM', serialNumber: `HMCG78${pad(i, 6)}` }, null);
      await addComponent(db, who, idOf(i), { componentCategoryId: catId('SSD'), brand: 'Samsung', model: 'PM9B1 512GB NVMe', serialNumber: `S7DENF0W${pad(i, 6)}` }, null);
      await completeAssembling(db, who, [idOf(i)], note);
    });
  }
}

/** Aktivasi Windows massal (key otomatis dari stok) → langsung ke QC. */
async function activateBulk(day: number, hh: number, nums: number[]) {
  await at(clock(day, hh, 5), () =>
    bulkActivate(db, staff.ACTIVATION, { unitIds: nums.map(idOf), activationTypeId: win!.id, softwareId: null, softwareVersion: '24H2', withKey: true, complete: true }),
  );
}

/** QC: dua pemeriksa bergantian. `fails` = nomor unit yang gagal + tujuan rework (null = cek ulang di QC). */
async function qc(day: number, nums: number[], fails: Record<number, { reworkTo: 'assembling' | 'activation' | null; notes: string }> = {}) {
  const form = await getQcForm(db, idOf(nums[0]!));
  const failIdx = form.items.findIndex((it) => it.inputType === 'pass_fail');
  const a = workday(day, 9);
  const b = workday(day, 9);
  for (const [k, i] of nums.entries()) {
    const who = k % 2 === 0 ? staff.QC : staff2.QC;
    const fail = fails[i];
    const results = form.items.map((it, n) => ({
      itemId: it.id,
      passed: it.inputType === 'pass_fail' ? !(fail && n === failIdx) : null,
      value: it.inputType === 'number' ? String(92 + (i % 7)) : it.inputType === 'text' ? 'OK' : null,
    }));
    await at((k % 2 === 0 ? a : b)(12), () => inspect(db, who, idOf(i), { results, notes: fail?.notes ?? null, reworkTo: fail?.reworkTo ?? null }, null));
  }
}

/** Packing: unit di tahap Packing yang belum masuk koli → koli isi 5 lalu disegel (maks `maxKoli`); `leaveOpen` unit dimasukkan ke koli yang belum disegel. */
async function pack(day: number, maxKoli: number, leaveOpen = 0) {
  const ready = (
    await db
      .select({ sn: units.serialNumber })
      .from(units)
      .where(and(eq(units.projectId, projectId), eq(units.status, 'packing'), isNull(units.packageId)))
      .orderBy(asc(units.serialNumber))
  ).map((r) => r.sn);
  const full = Math.min(maxKoli, Math.floor(ready.length / 5));
  const t = workday(day, 9);
  for (let k = 0; k < full; k++) {
    const group = ready.slice(k * 5, k * 5 + 5);
    const who = k % 2 === 0 ? staff.PACKING : staff2.PACKING;
    await at(t(25), async () => {
      const pkg = await createPackage(db, who, projectId, null);
      await packUnits(db, who, decodeId('package', pkg.id), group, null);
      await sealPackage(db, who, decodeId('package', pkg.id), { weightKg: 13.5, notes: null }, null);
    });
  }
  const rest = ready.slice(full * 5, full * 5 + leaveOpen);
  if (rest.length) {
    await at(t(20), async () => {
      const pkg = await createPackage(db, staff2.PACKING, projectId, null);
      await packUnits(db, staff2.PACKING, decodeId('package', pkg.id), rest, null);
    });
  }
}

async function sealedCodes() {
  const rows = await db
    .select({ code: packages.code })
    .from(packages)
    .where(and(eq(packages.projectId, projectId), eq(packages.status, 'sealed')))
    .orderBy(asc(packages.code));
  return rows.map((r) => r.code);
}

async function ship(createDay: number, count: number, shipDay: number, shipHour: number, courier: string, tracking: string | null, vehicle: string | null) {
  const packageCodes = (await sealedCodes()).slice(0, count);
  const s = await at(clock(createDay, 14, 0), async () => {
    const created = await createShipment(db, staff.LOGISTICS, projectId, null);
    await addPackages(db, staff.LOGISTICS, decodeId('shipment', created.id), packageCodes, null);
    return created;
  });
  await at(clock(shipDay, shipHour, 30), () => shipShipment(db, staff.LOGISTICS, decodeId('shipment', s.id), { courierId: courierId(courier), trackingNumber: tracking, vehicleInfo: vehicle, notes: null }, null));
  return decodeId('shipment', s.id);
}

async function deliver(shipmentId: number, day: number, hh: number, receiver: string) {
  await at(clock(day, hh, 15), () => deliverShipment(db, leader.LOGISTICS, shipmentId, { receivedByName: receiver, receivedAt: null, notes: 'Diterima lengkap, BAST ditandatangani.' }, null));
}

// ---------------------------------------------------------------------------
// Jalannya project (hari relatif terhadap hari ini; START = hari pertama)
// ---------------------------------------------------------------------------
const D = (n: number) => START + n; // hari ke-n project (0 = hari pertama, 8 = hari ini)

// Hari ke-1 (7 hari lalu): assembling mulai.
await assemble(D(1), range(1, 24));
// Hari ke-2
await activateBulk(D(2), 8, range(1, 24));
await assemble(D(2), range(25, 48));
await qc(D(2), range(1, 12));
// Hari ke-3: 1 unit gagal QC (Windows belum aktif) → dikembalikan ke Aktivasi. Packing mulai.
await activateBulk(D(3), 8, range(25, 48));
await qc(D(3), range(13, 30), { 17: { reworkTo: 'activation', notes: 'Windows belum teraktivasi (watermark muncul).' } });
await assemble(D(3), range(49, 70));
await pack(D(3), 3);
// Hari ke-4: pengiriman pertama berangkat.
await at(clock(D(4), 8, 20), () => completeActivation(db, staff.ACTIVATION, [idOf(17)], 'Aktivasi ulang online berhasil.'));
await activateBulk(D(4), 9, range(49, 70));
await qc(D(4), [...range(31, 50), 17], { 38: { reworkTo: null, notes: 'Ada 1 dead pixel, cek ulang setelah burn-in.' } });
await pack(D(4), 4);
const s1 = await ship(D(4), 4, D(4), 15, 'Kurir Internal', null, 'L300 B 9123 XY');
// Hari ke-5: pengiriman pertama diterima; 1 unit gagal QC (RAM) → dikembalikan ke Assembling.
await deliver(s1, D(5), 10, 'Bpk. Hendra Wijaya (Kepala TU)');
await qc(D(5), [38, ...range(51, 66)], { 60: { reworkTo: 'assembling', notes: 'RAM tidak terbaca penuh (8GB), pasang ulang.' } });
await assemble(D(5), range(71, 86));
await pack(D(5), 5);
const s2 = await ship(D(5), 4, D(5), 16, 'Deliveree', 'DLV-26092-8841', 'Grand Max B 9788 KQ');
// Hari ke-6
await at(clock(D(6), 8, 15), () => completeAssembling(db, staff.ASSEMBLING, [idOf(60)], 'Pasang ulang RAM, terbaca 16GB.'));
await at(clock(D(6), 9, 0), () => completeActivation(db, staff.ACTIVATION, [idOf(60)], 'Aktivasi masih valid setelah pasang ulang RAM.'));
await activateBulk(D(6), 7, range(71, 86));
await qc(D(6), [...range(67, 80), 60]);
await pack(D(6), 3);
// Hari ke-7 (kemarin): pengiriman kedua diterima, pengiriman ketiga berangkat.
await deliver(s2, D(7), 11, 'Ibu Ratna Sari (Staf Sarpras)');
const s3 = await ship(D(6), 4, D(7), 9, 'JNE', 'JNE-CGK-7781230045', null);
// Hari ke-8 (hari ini): pekerjaan masih berjalan di setiap tahap.
await assemble(D(8), range(87, 92));
await qc(D(8), range(81, 84));
await pack(D(8), 1, 3);

const counts = await db
  .select({ status: units.status, id: units.id })
  .from(units)
  .where(eq(units.projectId, projectId));
const byStatus = counts.reduce<Record<string, number>>((a, r) => ({ ...a, [r.status]: (a[r.status] ?? 0) + 1 }), {});
void s3; // pengiriman ketiga masih dalam perjalanan
console.log(`Project demo ${project.code}: ${UNIT_COUNT} unit laptop. Posisi unit sekarang:`, byStatus);
console.log(`Seed demo selesai. Password semua akun demo: ${DEMO_PASSWORD} (Super Admin: admin / admin12345)`);
await pool.end();
