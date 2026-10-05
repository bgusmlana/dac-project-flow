import type { KeyStockDto, LicenseKeyDto, ProjectDetailDto, UnitDetailDto } from '@manpro/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db, pool } from '../src/db/index.js';
import { licenseKeys, secretAccessLogs } from '../src/db/schema.js';
import { buildWorld, type World } from './fixtures.js';
import { setupTestApp } from './helpers.js';
import { decodeId } from '../src/lib/public-id.js';

let w: World;
let projectId: string;
let unitIds: string[];
let winOem: number;
let winServer: number;
let officeId: number;

beforeAll(async () => {
  w = await buildWorld(await setupTestApp());
  const made = await w.makeProject({ typeCode: 'LAPTOP', count: 6, prefix: 'LTP' });
  projectId = made.project.id;
  unitIds = made.unitIds;
  const types = (await w.req('GET', '/api/master/activation-types?pageSize=100', w.admin)).json().data as { id: number; name: string }[];
  winOem = types.find((t) => t.name === 'Windows 11 Pro OEM')!.id;
  winServer = types.find((t) => t.name === 'Windows Server 2025 Standard')!.id;
  const sws = (await w.req('GET', '/api/master/software?pageSize=100', w.admin)).json().data as { id: number; name: string }[];
  officeId = sws.find((s) => s.name === 'Microsoft Office LTSC 2024')!.id;
});

afterAll(async () => {
  await w.app.close();
  await pool.end();
});

const keys = (n: number, prefix: string) => Array.from({ length: n }, (_, i) => `${prefix}-AAAAA-BBBBB-CCCCC-${String(i).padStart(5, '0')}`);

describe('stok license key', () => {
  it('import key: duplikat (termasuk beda huruf/spasi) dibuang, key disimpan terenkripsi', async () => {
    const input = [...keys(5, 'WIN'), 'win-aaaaa-bbbbb-ccccc-00000 ', ...keys(2, 'WIN')];
    const res = await w.req('POST', '/api/license-keys/import', w.staff.ACTIVATION, { activationTypeId: winOem, keys: input });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ inserted: 5, duplicates: 0 });
    const again = await w.req('POST', '/api/license-keys/import', w.staff.ACTIVATION, { activationTypeId: winOem, keys: keys(2, 'WIN') });
    expect(again.json()).toMatchObject({ inserted: 0, duplicates: 2 });

    const rows = await db.select().from(licenseKeys);
    expect(JSON.stringify(rows)).not.toContain('WIN-AAAAA');
    expect(rows[0]!.keyLast5).toBe('00000');
  });

  it('divisi lain tidak boleh import atau membuka key', async () => {
    expect((await w.req('POST', '/api/license-keys/import', w.staff.QC, { activationTypeId: winOem, keys: ['X1234-56789'] })).statusCode).toBe(403);
    const list = (await w.req('GET', '/api/license-keys', w.staff.QC)).json();
    expect(list.data[0].masked).toMatch(/^XXXXX-/);
    expect((await w.req('POST', `/api/license-keys/${list.data[0].id}/reveal`, w.staff.QC)).statusCode).toBe(403);
  });

  it('buka key utuh tercatat di log akses', async () => {
    const list = (await w.req('GET', '/api/license-keys', w.admin)).json().data as LicenseKeyDto[];
    const res = await w.req('POST', `/api/license-keys/${list[0]!.id}/reveal`, w.staff.ACTIVATION);
    expect(res.json().key).toMatch(/^WIN-AAAAA-BBBBB-CCCCC-/);
    const logs = await db.select().from(secretAccessLogs).where(eq(secretAccessLogs.entityType, 'license_key'));
    expect(logs).toHaveLength(1);
  });

  it('alokasi key ke project & ringkasan stok', async () => {
    const res = await w.req('POST', '/api/license-keys/allocate', w.admin, { activationTypeId: winOem, fromProjectId: null, toProjectId: projectId, count: 2 });
    expect(res.json().moved).toBe(2);
    const stock = (await w.req('GET', '/api/license-keys/stock', w.admin)).json() as KeyStockDto[];
    const mine = stock.find((s) => s.projectId === projectId)!;
    expect(mine.counts.available).toBe(2);
    expect(stock.find((s) => s.projectId === null && s.activationTypeId === winOem)!.counts.available).toBe(3);
    expect((await w.req('POST', '/api/license-keys/allocate', w.admin, { activationTypeId: winOem, fromProjectId: null, toProjectId: projectId, count: 99 })).statusCode).toBe(400);
  });
});

describe('aktivasi per unit', () => {
  it('key otomatis diambil dari alokasi project dulu', async () => {
    const res = await w.req('POST', `/api/units/${unitIds[0]}/activations`, w.staff.ACTIVATION, { activationTypeId: winOem, autoAssign: true });
    expect(res.statusCode).toBe(200);
    const u = res.json() as UnitDetailDto;
    expect(u.activations).toHaveLength(1);
    expect(u.activations[0]).toMatchObject({ targetName: 'Windows 11 Pro OEM', result: 'success' });
    expect(u.activations[0]!.maskedKey).toMatch(/^XXXXX-/);
    const [k] = await db.select().from(licenseKeys).where(eq(licenseKeys.id, u.activations[0]!.licenseKeyId!));
    expect(k!.projectId).toBe(decodeId('project', projectId));
    expect(k!.status).toBe('activated');
  });

  it('jenis aktivasi yang tidak berlaku untuk laptop ditolak', async () => {
    const res = await w.req('POST', `/api/units/${unitIds[1]}/activations`, w.staff.ACTIVATION, { activationTypeId: winServer, autoAssign: false });
    expect(res.statusCode).toBe(400);
  });

  it('key manual: key baru langsung terdaftar; key yang sudah dipakai ditolak', async () => {
    const res = await w.req('POST', `/api/units/${unitIds[1]}/activations`, w.staff.ACTIVATION, { softwareId: officeId, softwareVersion: '2024', manualKey: 'OFF-11111-22222-33333-44444' });
    expect(res.statusCode).toBe(200);
    const dup = await w.req('POST', `/api/units/${unitIds[2]}/activations`, w.staff.ACTIVATION, { softwareId: officeId, manualKey: 'off-11111-22222-33333-44444' });
    expect(dup.statusCode).toBe(409);
  });

  it('hapus aktivasi mengembalikan key ke stok', async () => {
    const u = (await w.req('GET', `/api/units/${unitIds[1]}`, w.admin)).json() as UnitDetailDto;
    const act = u.activations[0]!;
    await w.req('DELETE', `/api/units/${unitIds[1]}/activations/${act.id}`, w.staff.ACTIVATION);
    const [k] = await db.select().from(licenseKeys).where(eq(licenseKeys.id, act.licenseKeyId!));
    expect(k!.status).toBe('available');
    // Sekarang key itu bisa dipakai unit lain.
    const res = await w.req('POST', `/api/units/${unitIds[2]}/activations`, w.staff.ACTIVATION, { softwareId: officeId, manualKey: 'OFF-11111-22222-33333-44444' });
    expect(res.statusCode).toBe(200);
  });

  it('aktivasi gagal tidak dihitung; selesai hanya kalau ada aktivasi berhasil', async () => {
    await w.req('POST', `/api/units/${unitIds[3]}/activations`, w.staff.ACTIVATION, { activationTypeId: winOem, result: 'failed', notes: 'Server Microsoft error' });
    const res = await w.req('POST', '/api/work/activation/complete', w.staff.ACTIVATION, { unitIds: [unitIds[0], unitIds[3]] });
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toContain('LTP-0004');
    const ok = await w.req('POST', '/api/work/activation/complete', w.staff.ACTIVATION, { unitIds: [unitIds[0]] });
    expect(ok.json().moved).toBe(1);
    const p = (await w.req('GET', `/api/projects/${projectId}`, w.admin)).json() as ProjectDetailDto;
    expect(p.counts.qc).toBe(1);
  });

  it('aktivasi massal: key cukup → semua unit teraktivasi & pindah ke QC', async () => {
    const targets = [unitIds[4]!, unitIds[5]!];
    const res = await w.req('POST', '/api/work/activation/bulk', w.staff.ACTIVATION, { unitIds: targets, activationTypeId: winOem, withKey: true, complete: true });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ activated: 2, keysUsed: 2, moved: 2 });
    const u = (await w.req('GET', `/api/units/${targets[0]}`, w.admin)).json() as UnitDetailDto;
    expect(u.status).toBe('qc');
    expect(u.activations[0]!.maskedKey).not.toBeNull();
  });

  it('aktivasi massal ditolak kalau stok key kurang (tidak ada yang tersimpan)', async () => {
    const res = await w.req('POST', '/api/work/activation/bulk', w.staff.ACTIVATION, { unitIds: [unitIds[1], unitIds[2], unitIds[3]], activationTypeId: winOem, withKey: true });
    expect(res.statusCode).toBe(400);
    const u = (await w.req('GET', `/api/units/${unitIds[1]}`, w.admin)).json() as UnitDetailDto;
    expect(u.activations).toHaveLength(0);
  });
});
