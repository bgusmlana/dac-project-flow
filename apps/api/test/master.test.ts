import type { ProductTypeDetailDto, ProductTypeSummaryDto } from '@manpro/shared';
import type { FastifyInstance } from 'fastify';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db, pool } from '../src/db/index.js';
import { qcTemplates } from '../src/db/schema.js';
import { ADMIN, divisionId, login, setupTestApp } from './helpers.js';

type Headers = Record<string, string>;

let app: FastifyInstance;
let admin: Headers;
let staffAdminProject: Headers;
let leaderAdminProject: Headers;
let staffQc: Headers;

const req = (method: 'GET' | 'POST' | 'PUT' | 'PATCH', url: string, headers: Headers, payload?: unknown) =>
  app.inject({ method, url, headers, payload: payload as never });

beforeAll(async () => {
  app = await setupTestApp();
  admin = (await login(app, ADMIN.username, ADMIN.password)).headers;
  const adminDiv = await divisionId(app, admin, 'ADMIN');
  const qcDiv = await divisionId(app, admin, 'QC');
  const users = [
    { name: 'Staff Admin', username: 'staff.admin', role: 'staff', divisionId: adminDiv },
    { name: 'Leader Admin', username: 'leader.admin', role: 'leader', divisionId: adminDiv },
    { name: 'Staff QC', username: 'staff.qc', role: 'staff', divisionId: qcDiv },
  ];
  for (const u of users) {
    const res = await req('POST', '/api/users', admin, { ...u, password: 'password123' });
    expect(res.statusCode).toBe(201);
  }
  staffAdminProject = (await login(app, 'staff.admin', 'password123')).headers;
  leaderAdminProject = (await login(app, 'leader.admin', 'password123')).headers;
  staffQc = (await login(app, 'staff.qc', 'password123')).headers;
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

describe('data awal (seed)', () => {
  it('8 jenis produk standar dengan tahapan sesuai spesifikasi', async () => {
    const res = await req('GET', '/api/product-types', admin);
    const types = res.json() as ProductTypeSummaryDto[];
    expect(types.map((t) => t.code).sort()).toEqual(['AIO', 'AKSESORIS', 'DESKTOP', 'IFP', 'LAPTOP', 'MINIPC', 'SERVER', 'WORKSTATION']);
    const laptop = types.find((t) => t.code === 'LAPTOP')!;
    expect(laptop.stages.find((s) => s.stage === 'assembling')?.requirement).toBe('optional');
    const aksesoris = types.find((t) => t.code === 'AKSESORIS')!;
    expect(aksesoris.stages.find((s) => s.stage === 'activation')?.requirement).toBe('skipped');
  });

  it('server punya kolom tambahan dan template QC versi 1', async () => {
    const list = (await req('GET', '/api/product-types', admin)).json() as ProductTypeSummaryDto[];
    const server = list.find((t) => t.code === 'SERVER')!;
    const detail = (await req('GET', `/api/product-types/${server.id}`, admin)).json() as ProductTypeDetailDto;
    expect(detail.customFields.map((f) => f.key)).toEqual(['hostname', 'ip_ipmi', 'raid_config', 'ipmi_password']);
    expect(detail.customFields.find((f) => f.key === 'ipmi_password')?.isSecret).toBe(true);
    expect(detail.qcTemplate?.version).toBe(1);
    expect(detail.componentCategoryIds.length).toBeGreaterThan(0);
  });
});

describe('master data sederhana', () => {
  let clientId: number;

  it('super admin bisa menambah client', async () => {
    const res = await req('POST', '/api/master/clients', admin, { name: 'Dinas Pendidikan Kota A', type: 'dinas', phone: '0211234' });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ name: 'Dinas Pendidikan Kota A', type: 'dinas', isActive: true, address: null });
    clientId = res.json().id;
  });

  it('nama client ganda ditolak', async () => {
    const res = await req('POST', '/api/master/clients', admin, { name: 'Dinas Pendidikan Kota A', type: 'dinas' });
    expect(res.statusCode).toBe(409);
  });

  it('staff divisi Admin Project boleh menambah vendor', async () => {
    const res = await req('POST', '/api/master/vendors', staffAdminProject, { name: 'PT Distributor Satu', type: 'supplier' });
    expect(res.statusCode).toBe(201);
  });

  it('staff divisi lain hanya bisa melihat, tidak bisa menambah', async () => {
    expect((await req('GET', '/api/master/clients', staffQc)).statusCode).toBe(200);
    expect((await req('POST', '/api/master/clients', staffQc, { name: 'X', type: 'swasta' })).statusCode).toBe(403);
  });

  it('ubah dan nonaktifkan client', async () => {
    const upd = await req('PUT', `/api/master/clients/${clientId}`, admin, { name: 'Dinas Pendidikan Kota A (Baru)', type: 'dinas' });
    expect(upd.statusCode).toBe(200);
    expect(upd.json().name).toBe('Dinas Pendidikan Kota A (Baru)');

    expect((await req('PATCH', `/api/master/clients/${clientId}/active`, admin, { isActive: false })).statusCode).toBe(200);
    const active = (await req('GET', '/api/master/clients', admin)).json();
    expect(active.data.find((c: { id: number }) => c.id === clientId)).toBeUndefined();
    const all = (await req('GET', '/api/master/clients?includeInactive=true', admin)).json();
    expect(all.data.find((c: { id: number }) => c.id === clientId)?.isActive).toBe(false);
  });

  it('jenis master yang tidak dikenal → 404', async () => {
    expect((await req('GET', '/api/master/tidak-ada', admin)).statusCode).toBe(404);
  });

  it('data awal ekspedisi & kategori komponen tersedia', async () => {
    const couriers = (await req('GET', '/api/master/couriers', staffQc)).json();
    expect(couriers.data.map((c: { name: string }) => c.name)).toContain('JNE');
    const comps = (await req('GET', '/api/master/component-categories?pageSize=100', staffQc)).json();
    expect(comps.total).toBe(18);
  });
});

describe('katalog produk', () => {
  let laptopTypeId: number;

  beforeAll(async () => {
    const types = (await req('GET', '/api/product-types', admin)).json() as ProductTypeSummaryDto[];
    laptopTypeId = types.find((t) => t.code === 'LAPTOP')!.id;
  });

  it('tambah produk & cegah merek + part number ganda', async () => {
    const payload = { productTypeId: laptopTypeId, brand: 'Lenovo', model: 'ThinkPad E14 Gen 6', partNumber: '21M7000XID', specification: 'Core i5, 16GB, 512GB' };
    const res = await req('POST', '/api/products', staffAdminProject, payload);
    expect(res.statusCode).toBe(201);
    expect(res.json().productTypeName).toBe('Laptop');
    expect((await req('POST', '/api/products', admin, payload)).statusCode).toBe(409);
  });

  it('produk tanpa part number boleh lebih dari satu', async () => {
    for (const model of ['Generic A', 'Generic B']) {
      const res = await req('POST', '/api/products', admin, { productTypeId: laptopTypeId, brand: 'Lokal', model, partNumber: '' });
      expect(res.statusCode).toBe(201);
      expect(res.json().partNumber).toBeNull();
    }
  });

  it('cari & filter per jenis produk', async () => {
    const res = (await req('GET', `/api/products?search=thinkpad&productTypeId=${laptopTypeId}`, staffQc)).json();
    expect(res.total).toBe(1);
  });

  it('staff divisi lain tidak bisa menambah produk', async () => {
    const res = await req('POST', '/api/products', staffQc, { productTypeId: laptopTypeId, brand: 'X', model: 'Y' });
    expect(res.statusCode).toBe(403);
  });
});

describe('konfigurasi jenis produk', () => {
  let typeId: number;
  let detail: ProductTypeDetailDto;

  it('divisi Admin Project (bahkan leader) tidak boleh mengatur jenis produk', async () => {
    const res = await req('POST', '/api/product-types', leaderAdminProject, { code: 'PROYEKTOR', name: 'Proyektor' });
    expect(res.statusCode).toBe(403);
  });

  it('super admin menambah jenis produk baru dengan tahapan default', async () => {
    const res = await req('POST', '/api/product-types', admin, { code: 'proyektor', name: 'Proyektor' });
    expect(res.statusCode).toBe(201);
    detail = res.json();
    typeId = detail.id;
    expect(detail.code).toBe('PROYEKTOR');
    expect(detail.stages).toHaveLength(6);
    expect(detail.stages.find((s) => s.stage === 'installation')?.requirement).toBe('optional');
    expect(detail.qcTemplate).toBeNull();
  });

  it('kode jenis produk ganda ditolak', async () => {
    expect((await req('POST', '/api/product-types', admin, { code: 'LAPTOP', name: 'Laptop 2' })).statusCode).toBe(409);
  });

  it('atur tahapan, komponen, dan aktivasi', async () => {
    const comps = (await req('GET', '/api/master/component-categories?pageSize=100', admin)).json();
    const remote = comps.data.find((c: { name: string }) => c.name === 'Remote').id;
    const stages = detail.stages.map((s) => ({ ...s, requirement: s.stage === 'assembling' || s.stage === 'activation' ? 'skipped' : s.requirement }));
    const res = await req('PUT', `/api/product-types/${typeId}`, admin, {
      code: 'PROYEKTOR',
      name: 'Proyektor',
      stages,
      componentCategoryIds: [remote],
      activationTypeIds: [],
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().stages.find((s: { stage: string }) => s.stage === 'assembling').requirement).toBe('skipped');
    expect(res.json().componentCategoryIds).toEqual([remote]);
  });

  it('tahap ekspedisi tidak boleh dilewati', async () => {
    const stages = detail.stages.map((s) => ({ ...s, requirement: s.stage === 'shipping' ? 'skipped' : s.requirement }));
    const res = await req('PUT', `/api/product-types/${typeId}`, admin, { code: 'PROYEKTOR', name: 'Proyektor', stages, componentCategoryIds: [], activationTypeIds: [] });
    expect(res.statusCode).toBe(400);
  });

  it('kategori komponen yang tidak ada ditolak', async () => {
    const res = await req('PUT', `/api/product-types/${typeId}`, admin, {
      code: 'PROYEKTOR',
      name: 'Proyektor',
      stages: detail.stages,
      componentCategoryIds: [99999],
      activationTypeIds: [],
    });
    expect(res.statusCode).toBe(400);
  });

  it('simpan kolom tambahan', async () => {
    const res = await req('PUT', `/api/product-types/${typeId}/custom-fields`, admin, {
      fields: [
        { key: 'lumen', label: 'Lumen', inputType: 'number' },
        { key: 'resolusi', label: 'Resolusi', inputType: 'select', options: ['XGA', 'WXGA', 'Full HD'] },
      ],
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().customFields.map((f: { key: string }) => f.key)).toEqual(['lumen', 'resolusi']);

    const bad = await req('PUT', `/api/product-types/${typeId}/custom-fields`, admin, {
      fields: [{ key: 'Resolusi Layar', label: 'Resolusi', inputType: 'text' }],
    });
    expect(bad.statusCode).toBe(400);
  });

  it('template QC tersimpan sebagai versi baru, versi lama tetap ada', async () => {
    const v1 = await req('PUT', `/api/product-types/${typeId}/qc-template`, admin, { items: [{ label: 'Lampu menyala', inputType: 'pass_fail' }] });
    expect(v1.json().qcTemplate.version).toBe(1);
    const v2 = await req('PUT', `/api/product-types/${typeId}/qc-template`, admin, {
      items: [
        { label: 'Lampu menyala', inputType: 'pass_fail' },
        { label: 'Fokus gambar', inputType: 'pass_fail' },
      ],
    });
    expect(v2.json().qcTemplate.version).toBe(2);
    expect(v2.json().qcTemplate.items).toHaveLength(2);

    const versions = await db.select().from(qcTemplates).where(eq(qcTemplates.productTypeId, typeId));
    expect(versions).toHaveLength(2);
    const active = await db
      .select()
      .from(qcTemplates)
      .where(and(eq(qcTemplates.productTypeId, typeId), eq(qcTemplates.isActive, true)));
    expect(active.map((t) => t.version)).toEqual([2]);
  });

  it('template QC kosong ditolak', async () => {
    expect((await req('PUT', `/api/product-types/${typeId}/qc-template`, admin, { items: [] })).statusCode).toBe(400);
  });

  it('jenis produk nonaktif tidak tampil di daftar & tidak bisa dipakai produk baru', async () => {
    await req('PATCH', `/api/product-types/${typeId}/active`, admin, { isActive: false });
    const list = (await req('GET', '/api/product-types', admin)).json() as ProductTypeSummaryDto[];
    expect(list.find((t) => t.id === typeId)).toBeUndefined();
    const res = await req('POST', '/api/products', admin, { productTypeId: typeId, brand: 'Epson', model: 'EB-X51' });
    expect(res.statusCode).toBe(400);
  });
});
