import type { ProjectDetailDto, UnitDetailDto } from '@manpro/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pool } from '../src/db/index.js';
import { buildWorld, type World } from './fixtures.js';
import { setupTestApp } from './helpers.js';

let w: World;
let projectId: string;
let unitIds: string[];
let ramId: number;
let ssdId: number;

beforeAll(async () => {
  w = await buildWorld(await setupTestApp());
  const made = await w.makeProject({ typeCode: 'DESKTOP', count: 3, prefix: 'DSK' });
  projectId = made.project.id;
  unitIds = made.unitIds;
  const cats = (await w.req('GET', '/api/master/component-categories?pageSize=100', w.admin)).json().data as { id: number; name: string }[];
  ramId = cats.find((c) => c.name === 'RAM')!.id;
  ssdId = cats.find((c) => c.name === 'SSD')!.id;
});

afterAll(async () => {
  await w.app.close();
  await pool.end();
});

describe('antrian lini produksi', () => {
  it('unit desktop baru masuk antrian assembling', async () => {
    const q = (await w.req('GET', `/api/work/assembling?projectId=${projectId}`, w.staff.ASSEMBLING)).json();
    expect(q.total).toBe(3);
    const projects = (await w.req('GET', '/api/work/assembling/projects', w.staff.ASSEMBLING)).json();
    expect(projects).toEqual([expect.objectContaining({ projectId, count: 3 })]);
  });
});

describe('assembling', () => {
  it('divisi assembling mencatat komponen; kategori yang tidak berlaku ditolak', async () => {
    const res = await w.req('POST', `/api/units/${unitIds[0]}/components`, w.staff.ASSEMBLING, { componentCategoryId: ramId, brand: 'Kingston', model: '16GB DDR5', serialNumber: 'RAM-001' });
    expect(res.statusCode).toBe(200);
    const u = res.json() as UnitDetailDto;
    expect(u.components).toHaveLength(1);
    expect(u.components[0]).toMatchObject({ categoryName: 'RAM', installedByName: 'Staff ASSEMBLING' });
    expect(u.componentCategories.map((c) => c.name)).toContain('Motherboard');

    const cats = (await w.req('GET', '/api/master/component-categories?pageSize=100', w.admin)).json().data as { id: number; name: string }[];
    const remote = cats.find((c) => c.name === 'Remote')!.id;
    const bad = await w.req('POST', `/api/units/${unitIds[0]}/components`, w.staff.ASSEMBLING, { componentCategoryId: remote, brand: 'X', model: 'Y' });
    expect(bad.statusCode).toBe(400);
  });

  it('SN komponen yang sudah terpasang di unit lain ditolak', async () => {
    const res = await w.req('POST', `/api/units/${unitIds[1]}/components`, w.staff.ASSEMBLING, { componentCategoryId: ramId, brand: 'Kingston', model: '16GB', serialNumber: 'RAM-001' });
    expect(res.statusCode).toBe(409);
  });

  it('divisi lain tidak boleh mencatat komponen', async () => {
    const res = await w.req('POST', `/api/units/${unitIds[1]}/components`, w.staff.QC, { componentCategoryId: ssdId, brand: 'X', model: 'Y' });
    expect(res.statusCode).toBe(403);
  });

  it('unit tanpa komponen tidak bisa diselesaikan', async () => {
    const res = await w.req('POST', '/api/work/assembling/complete', w.staff.ASSEMBLING, { unitIds: [unitIds[0], unitIds[1]] });
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toContain('DSK-0002');
  });

  it('hapus komponen, lalu selesaikan assembling → pindah ke aktivasi', async () => {
    await w.req('POST', `/api/units/${unitIds[1]}/components`, w.staff.ASSEMBLING, { componentCategoryId: ssdId, brand: 'Samsung', model: '990 Pro', serialNumber: 'SSD-9' });
    const tmp = (await w.req('POST', `/api/units/${unitIds[1]}/components`, w.staff.ASSEMBLING, { componentCategoryId: ramId, brand: 'Salah', model: 'Salah' })).json() as UnitDetailDto;
    const wrong = tmp.components.find((c) => c.brand === 'Salah')!;
    const after = (await w.req('DELETE', `/api/units/${unitIds[1]}/components/${wrong.id}`, w.staff.ASSEMBLING)).json() as UnitDetailDto;
    expect(after.components).toHaveLength(1);

    const res = await w.req('POST', '/api/work/assembling/complete', w.staff.ASSEMBLING, { unitIds: [unitIds[0], unitIds[1]] });
    expect(res.statusCode).toBe(200);
    expect(res.json().moved).toBe(2);
    const p = (await w.req('GET', `/api/projects/${projectId}`, w.admin)).json() as ProjectDetailDto;
    expect(p.counts).toEqual({ assembling: 1, activation: 2 });
  });

  it('komponen tidak bisa diubah setelah unit keluar dari assembling', async () => {
    const res = await w.req('POST', `/api/units/${unitIds[0]}/components`, w.staff.ASSEMBLING, { componentCategoryId: ssdId, brand: 'X', model: 'Y' });
    expect(res.statusCode).toBe(400);
  });
});
