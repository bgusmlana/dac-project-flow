import type { DashboardDto, UnitDetailDto } from '@manpro/shared';
import ExcelJS from 'exceljs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pool } from '../src/db/index.js';
import { buildWorld, type World } from './fixtures.js';
import { setupTestApp } from './helpers.js';

let w: World;
let projectId: string;
let unitIds: string[];

beforeAll(async () => {
  w = await buildWorld(await setupTestApp());
  const made = await w.makeProject({ typeCode: 'DESKTOP', count: 3, prefix: 'RPT', project: { targetDate: '2020-01-01' } });
  projectId = made.project.id;
  unitIds = made.unitIds;
  const cats = (await w.req('GET', '/api/master/component-categories?pageSize=100', w.admin)).json().data as { id: number; name: string }[];
  const ssd = cats.find((c) => c.name === 'SSD')!.id;
  await w.req('POST', `/api/units/${unitIds[0]}/components`, w.staff.ASSEMBLING, { componentCategoryId: ssd, brand: 'Samsung', model: '990 Pro 1TB', serialNumber: 'S6Z1NJ0W123' });
  await w.req('POST', '/api/work/assembling/complete', w.staff.ASSEMBLING, { unitIds: [unitIds[0]] });
});

afterAll(async () => {
  await w.app.close();
  await pool.end();
});

describe('dashboard', () => {
  it('project aktif, total per tahap, deadline lewat, dan throughput', async () => {
    const d = (await w.req('GET', '/api/dashboard', w.staff.QC)).json() as DashboardDto;
    expect(d.projects.map((p) => p.id)).toContain(projectId);
    expect(d.stageTotals).toMatchObject({ assembling: 2, activation: 1 });
    expect(d.overdueCount).toBe(1);
    expect(d.throughput).toHaveLength(7);
    expect(d.throughput.at(-1)!.counts.assembling).toBe(1);
  });
});

describe('pelacakan garansi', () => {
  it('cari berdasarkan SN komponen → unit tempat komponen terpasang', async () => {
    const u = (await w.req('GET', '/api/units/lookup?sn=S6Z1NJ0W123', w.staff.QC)).json() as UnitDetailDto;
    expect(u.id).toBe(unitIds[0]);
    expect(u.clientName).toBe('Dinas Uji');
    expect(u.vendorName).toBe('Vendor Uji');
    expect(u.components[0]!.model).toBe('990 Pro 1TB');
  });
});

describe('export Excel', () => {
  it('berisi satu baris per unit beserta komponen', async () => {
    const res = await w.app.inject({ method: 'GET', url: `/api/projects/${projectId}/export`, headers: w.admin });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-disposition']).toContain('-unit.xlsx');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(res.rawPayload as unknown as ArrayBuffer);
    const ws = wb.getWorksheet('Unit')!;
    expect(ws.rowCount).toBe(4);
    const header = (ws.getRow(1).values as string[]).slice(1);
    expect(header).toContain('Komponen');
    const first = ws.getRow(2);
    expect(first.getCell(1).value).toBe('RPT-0001');
    expect(String(first.getCell(6).value)).toContain('SSD: Samsung 990 Pro 1TB (S6Z1NJ0W123)');
  });
});
