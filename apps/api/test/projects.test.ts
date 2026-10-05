import type { ImportJobDto, ProjectDetailDto, UnitDetailDto } from '@manpro/shared';
import type { FastifyInstance } from 'fastify';
import ExcelJS from 'exceljs';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db, pool } from '../src/db/index.js';
import { secretAccessLogs, units } from '../src/db/schema.js';
import { advanceUnits } from '../src/services/workflow.js';
import { ADMIN, divisionId, login, multipartBody, setupTestApp, waitFor } from './helpers.js';
import { decodeId } from '../src/lib/public-id.js';

type Headers = Record<string, string>;

let app: FastifyInstance;
let admin: Headers;
let staffQc: Headers;
let staffAdmin: Headers;
let clientId: number;
let vendorId: number;
let laptopProductId: number;
let serverProductId: number;
let projectId: string;
let laptopItemId: number;
let serverItemId: number;

const req = (method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', url: string, headers: Headers, payload?: unknown) =>
  app.inject({ method, url, headers, payload: payload as never });

const adminActor = async () => {
  const me = (await req('GET', '/api/me', admin)).json();
  return { id: me.id as string, role: 'super_admin' as const, divisionId: null, divisionCode: null };
};

beforeAll(async () => {
  app = await setupTestApp();
  admin = (await login(app, ADMIN.username, ADMIN.password)).headers;
  const qcDiv = await divisionId(app, admin, 'QC');
  const adminDiv = await divisionId(app, admin, 'ADMIN');
  await req('POST', '/api/users', admin, { name: 'QC', username: 'staff.qc', password: 'password123', role: 'staff', divisionId: qcDiv });
  await req('POST', '/api/users', admin, { name: 'Admin', username: 'staff.admin', password: 'password123', role: 'staff', divisionId: adminDiv });
  staffQc = (await login(app, 'staff.qc', 'password123')).headers;
  staffAdmin = (await login(app, 'staff.admin', 'password123')).headers;

  clientId = (await req('POST', '/api/master/clients', admin, { name: 'Dinas Pendidikan', type: 'dinas' })).json().id;
  vendorId = (await req('POST', '/api/master/vendors', admin, { name: 'PT Distributor', type: 'supplier' })).json().id;
  const types = (await req('GET', '/api/product-types', admin)).json() as { id: number; code: string }[];
  const typeId = (code: string) => types.find((t) => t.code === code)!.id;
  laptopProductId = (await req('POST', '/api/products', admin, { productTypeId: typeId('LAPTOP'), brand: 'Lenovo', model: 'ThinkPad E14', partNumber: 'PN-1' })).json().id;
  serverProductId = (await req('POST', '/api/products', admin, { productTypeId: typeId('SERVER'), brand: 'Dell', model: 'PowerEdge R760', partNumber: 'PN-2' })).json().id;
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

describe('project', () => {
  it('kode project otomatis berurutan per tahun', async () => {
    const year = new Date().getFullYear();
    const a = await req('POST', '/api/projects', staffAdmin, { name: 'Pengadaan Laptop Sekolah', clientId, poNumber: 'PO-001', targetDate: '2026-12-31' });
    expect(a.statusCode).toBe(201);
    expect(a.json().code).toBe(`PRJ-${year}-0001`);
    expect(a.json().status).toBe('draft');
    projectId = a.json().id;
    const b = await req('POST', '/api/projects', admin, { name: 'Project Kedua', clientId });
    expect(b.json().code).toBe(`PRJ-${year}-0002`);
  });

  it('mode sampling wajib isi ukuran lot, persen sampel, dan batas gagal', async () => {
    const res = await req('POST', '/api/projects', admin, { name: 'X', clientId, qcMode: 'sampling' });
    expect(res.statusCode).toBe(400);
    const ok = await req('POST', '/api/projects', admin, { name: 'Y', clientId, qcMode: 'sampling', lotSize: 500, samplePercent: 5, maxSampleFail: 1 });
    expect(ok.statusCode).toBe(201);
  });

  it('staff divisi lain tidak bisa membuat project tapi bisa melihat', async () => {
    expect((await req('POST', '/api/projects', staffQc, { name: 'X', clientId })).statusCode).toBe(403);
    const list = await req('GET', '/api/projects?search=laptop', staffQc);
    expect(list.statusCode).toBe(200);
    expect(list.json().total).toBe(1);
  });
});

describe('item project', () => {
  it('tahap opsional dipilih per item; tahap wajib selalu ada', async () => {
    const res = await req('POST', `/api/projects/${projectId}/items`, admin, { productId: laptopProductId, vendorId, quantity: 2000 });
    expect(res.statusCode).toBe(201);
    const item = (res.json() as ProjectDetailDto).items[0]!;
    expect(item.stages).toEqual(['activation', 'qc', 'packing', 'shipping']);
    expect(item.brand).toBe('Lenovo');
    laptopItemId = item.id;

    const res2 = await req('POST', `/api/projects/${projectId}/items`, admin, {
      productId: serverProductId,
      vendorId,
      quantity: 3,
      optionalStages: ['installation'],
      accessories: ['Rail Kit'],
    });
    const server = (res2.json() as ProjectDetailDto).items[1]!;
    expect(server.stages).toEqual(['assembling', 'activation', 'qc', 'packing', 'shipping', 'installation']);
    expect(server.accessories).toEqual(['Rail Kit']);
    serverItemId = server.id;
  });

  it('item kosong boleh dihapus', async () => {
    const res = await req('POST', `/api/projects/${projectId}/items`, admin, { productId: laptopProductId, vendorId, quantity: 1 });
    const extra = (res.json() as ProjectDetailDto).items.at(-1)!;
    expect((await req('DELETE', `/api/projects/${projectId}/items/${extra.id}`, admin)).statusCode).toBe(200);
  });
});

describe('unit manual', () => {
  it('tambah unit: SN ganda di input & SN yang sudah ada dilaporkan', async () => {
    const res = await req('POST', `/api/projects/${projectId}/items/${serverItemId}/units`, admin, { serialNumbers: ['SRV-1', 'SRV-2', 'srv-1'] });
    expect(res.statusCode).toBe(200);
    expect(res.json().inserted).toBe(2);
    expect(res.json().errors).toHaveLength(1);

    const again = await req('POST', `/api/projects/${projectId}/items/${serverItemId}/units`, admin, { serialNumbers: ['SRV-2', 'SRV-3', 'SRV-4'] });
    expect(again.json().inserted).toBe(1);
    const messages = again.json().errors.map((e: { message: string }) => e.message).join(' | ');
    expect(messages).toContain('sudah terdaftar');
    expect(messages).toContain('melebihi jumlah');
  });

  it('project otomatis berjalan & counter progres benar', async () => {
    const p = (await req('GET', `/api/projects/${projectId}`, admin)).json() as ProjectDetailDto;
    expect(p.status).toBe('in_progress');
    expect(p.counts.assembling).toBe(3);
    expect(p.unitCount).toBe(3);
    expect(p.totalQuantity).toBe(2003);
  });

  it('item yang sudah punya unit: tahapan & produk tidak bisa diubah, jumlah tidak boleh di bawah unit', async () => {
    const base = { productId: serverProductId, vendorId, quantity: 3, optionalStages: ['installation'], accessories: ['Rail Kit'] };
    expect((await req('PUT', `/api/projects/${projectId}/items/${serverItemId}`, admin, { ...base, optionalStages: [] })).statusCode).toBe(400);
    expect((await req('PUT', `/api/projects/${projectId}/items/${serverItemId}`, admin, { ...base, quantity: 2 })).statusCode).toBe(400);
    expect((await req('PUT', `/api/projects/${projectId}/items/${serverItemId}`, admin, { ...base, quantity: 5 })).statusCode).toBe(200);
    expect((await req('DELETE', `/api/projects/${projectId}/items/${serverItemId}`, admin)).statusCode).toBe(400);
  });
});

describe('detail unit', () => {
  let unitId: string;

  beforeAll(async () => {
    unitId = ((await req('GET', '/api/units/lookup?sn=SRV-1', staffQc)).json() as UnitDetailDto).id;
  });

  it('kolom tambahan & kolom rahasia terenkripsi', async () => {
    const res = await req('PUT', `/api/units/${unitId}/fields`, admin, {
      customFields: { hostname: 'srv-dinas-01', raid_config: 'RAID 5', ipmi_password: 'Rahasia#123' },
    });
    expect(res.statusCode).toBe(200);
    const detail = res.json() as UnitDetailDto;
    const pw = detail.fields.find((f) => f.key === 'ipmi_password')!;
    expect(pw.value).toBeNull();
    expect(pw.hasValue).toBe(true);
    expect(detail.fields.find((f) => f.key === 'hostname')!.value).toBe('srv-dinas-01');

    const [raw] = await db.select({ f: units.customFields }).from(units).where(eq(units.id, decodeId('unit', unitId)));
    expect(JSON.stringify(raw)).not.toContain('Rahasia#123');

    const reveal = await req('POST', `/api/units/${unitId}/fields/ipmi_password/reveal`, admin);
    expect(reveal.json().value).toBe('Rahasia#123');
    const logs = await db.select().from(secretAccessLogs).where(eq(secretAccessLogs.entityId, String(decodeId('unit', unitId))));
    expect(logs).toHaveLength(1);
  });

  it('alamat dengan ID angka urut (/api/units/1) tidak bisa dipakai', async () => {
    for (const url of ['/api/units/1', '/api/projects/1', `/api/units/${decodeId('unit', unitId)}`, '/api/packages/1', '/api/shipments/1']) {
      expect((await req('GET', url, admin)).statusCode).toBe(404);
    }
  });

  it('nilai pilihan yang tidak valid ditolak', async () => {
    const res = await req('PUT', `/api/units/${unitId}/fields`, admin, { customFields: { raid_config: 'RAID 99' } });
    expect(res.statusCode).toBe(400);
  });

  it('divisi QC tidak bisa mengubah unit yang masih di assembling', async () => {
    const res = await req('PUT', `/api/units/${unitId}/fields`, staffQc, { customFields: { hostname: 'x' } });
    expect(res.statusCode).toBe(403);
  });

  it('kelengkapan: tambah, cari unit lewat SN kelengkapan, hapus', async () => {
    const res = await req('POST', `/api/units/${unitId}/accessories`, admin, { name: 'Rail Kit', serialNumber: 'RAIL-001' });
    expect(res.statusCode).toBe(200);
    const acc = (res.json() as UnitDetailDto).accessories[0]!;
    expect(((await req('GET', '/api/units/lookup?sn=RAIL-001', staffQc)).json() as UnitDetailDto).id).toBe(unitId);
    const del = await req('DELETE', `/api/units/${unitId}/accessories/${acc.id}`, admin);
    expect((del.json() as UnitDetailDto).accessories).toHaveLength(0);
  });

  it('alur tahap: advance mengikuti tahapan item & mencatat riwayat', async () => {
    const actor = await adminActor();
    await db.transaction((tx) => advanceUnits(tx, actor, [decodeId('unit', unitId)], 'assembling'));
    const detail = (await req('GET', `/api/units/${unitId}`, admin)).json() as UnitDetailDto;
    expect(detail.status).toBe('activation');
    expect(detail.logs.map((l) => l.action)).toEqual(['advance', 'create']);
    const p = (await req('GET', `/api/projects/${projectId}`, admin)).json() as ProjectDetailDto;
    expect(p.counts.assembling).toBe(2);
    expect(p.counts.activation).toBe(1);
  });

  it('advance ditolak kalau unit tidak di tahap tersebut atau divisi salah', async () => {
    const actor = await adminActor();
    await expect(db.transaction((tx) => advanceUnits(tx, actor, [decodeId('unit', unitId)], 'assembling'))).rejects.toThrow(/sedang di tahap Aktivasi/);
    const qcActor = { id: 'x', role: 'staff' as const, divisionId: 4, divisionCode: 'QC' as const };
    await expect(db.transaction((tx) => advanceUnits(tx, qcActor, [decodeId('unit', unitId)], 'activation'))).rejects.toThrow(/Hanya divisi/);
  });

  it('unit yang sudah diproses tidak bisa dihapus; unit baru bisa', async () => {
    expect((await req('DELETE', `/api/units/${unitId}`, admin)).statusCode).toBe(400);
    const other = (await req('GET', '/api/units/lookup?sn=SRV-2', admin)).json() as UnitDetailDto;
    expect((await req('DELETE', `/api/units/${other.id}`, admin)).statusCode).toBe(204);
    const p = (await req('GET', `/api/projects/${projectId}`, admin)).json() as ProjectDetailDto;
    expect(p.counts.assembling).toBe(1);
  });
});

describe('import unit dari Excel', () => {
  it('template berisi kolom yang dikenali', async () => {
    const res = await req('GET', `/api/projects/${projectId}/items/${serverItemId}/import-template`, admin);
    expect(res.statusCode).toBe(200);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(res.rawPayload as unknown as ArrayBuffer);
    const header = (wb.getWorksheet('Unit')!.getRow(1).values as string[]).slice(1);
    expect(header).toEqual(['serial_number', 'hostname', 'ip_ipmi', 'raid_config', 'ipmi_password', 'SN Rail Kit']);
  });

  it('import 1.500 baris lewat queue: baris valid masuk, error dilaporkan per baris', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Unit');
    ws.addRow(['serial_number']);
    for (let i = 1; i <= 1500; i++) ws.addRow([`LTP-${String(i).padStart(5, '0')}`]);
    ws.addRow(['LTP-00010']); // ganda
    ws.addRow(['']); // kosong → dilewati
    ws.addRow([12345678]); // angka → tetap dibaca sebagai teks
    const file = Buffer.from(await wb.xlsx.writeBuffer());

    const { body, contentType } = multipartBody('file', 'unit.xlsx', file);
    const res = await app.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/items/${laptopItemId}/import`,
      headers: { ...admin, 'content-type': contentType },
      payload: body,
    });
    expect(res.statusCode).toBe(202);
    const jobId = res.json().id;

    const job = await waitFor(
      async () => (await req('GET', `/api/imports/${jobId}`, admin)).json() as ImportJobDto,
      (j) => j.status === 'done' || j.status === 'failed',
    );
    expect(job.message).toBeNull();
    expect(job.status).toBe('done');
    expect(job.totalRows).toBe(1502);
    expect(job.successRows).toBe(1501);
    expect(job.failedRows).toBe(1);
    expect(job.errors[0]).toMatchObject({ row: 1502 });

    const p = (await req('GET', `/api/projects/${projectId}`, admin)).json() as ProjectDetailDto;
    expect(p.counts.activation).toBe(1 + 1501);
    const list = (await req('GET', `/api/projects/${projectId}/units?search=12345678`, admin)).json();
    expect(list.total).toBe(1);
  });

  it('import CSV ber-titik-koma & file tanpa kolom serial_number gagal dengan pesan jelas', async () => {
    const csv = multipartBody('file', 'unit.csv', Buffer.from('serial_number;catatan\nCSV-1;a\nCSV-2;b\n'));
    const ok = await app.inject({ method: 'POST', url: `/api/projects/${projectId}/items/${laptopItemId}/import`, headers: { ...admin, 'content-type': csv.contentType }, payload: csv.body });
    const okJob = await waitFor(async () => (await req('GET', `/api/imports/${ok.json().id}`, admin)).json() as ImportJobDto, (j) => j.status !== 'queued' && j.status !== 'processing');
    expect(okJob.successRows).toBe(2);

    const bad = multipartBody('file', 'salah.csv', Buffer.from('nomor\nX-1\n'));
    const res = await app.inject({ method: 'POST', url: `/api/projects/${projectId}/items/${laptopItemId}/import`, headers: { ...admin, 'content-type': bad.contentType }, payload: bad.body });
    const job = await waitFor(async () => (await req('GET', `/api/imports/${res.json().id}`, admin)).json() as ImportJobDto, (j) => j.status === 'failed' || j.status === 'done');
    expect(job.status).toBe('failed');
    expect(job.message).toContain('serial_number');
  });

  it('format file selain xlsx/csv ditolak', async () => {
    const f = multipartBody('file', 'unit.pdf', Buffer.from('x'));
    const res = await app.inject({ method: 'POST', url: `/api/projects/${projectId}/items/${laptopItemId}/import`, headers: { ...admin, 'content-type': f.contentType }, payload: f.body });
    expect(res.statusCode).toBe(400);
  });
});
