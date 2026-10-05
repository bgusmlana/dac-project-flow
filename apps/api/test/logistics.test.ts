import type { PackageDetailDto, PackResultDto, ProjectDetailDto, ShipmentDetailDto, UnitDetailDto } from '@manpro/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pool } from '../src/db/index.js';
import { buildWorld, type World } from './fixtures.js';
import { setupTestApp } from './helpers.js';

let w: World;
let projectId: string;
let unitIds: string[];
let sns: string[];

/**
 * Project IFP: tahap QC → Packing → Ekspedisi → Instalasi (assembling & aktivasi opsional tidak dipilih).
 * Kelengkapan wajib: Remote.
 */
beforeAll(async () => {
  w = await buildWorld(await setupTestApp());
  const made = await w.makeProject({ typeCode: 'IFP', count: 4, prefix: 'IFP', optionalStages: ['installation'], accessories: ['Remote'] });
  projectId = made.project.id;
  unitIds = made.unitIds;
  sns = unitIds.map((_, i) => `IFP-${String(i + 1).padStart(4, '0')}`);
  expect(made.project.items[0]!.stages).toEqual(['qc', 'packing', 'shipping', 'installation']);
  // Lolos QC semua unit.
  for (const id of unitIds) {
    const f = (await w.req('GET', `/api/qc/units/${id}`, w.staff.QC)).json();
    const results = f.items.map((i: { id: number; inputType: string }) => ({ itemId: i.id, passed: i.inputType === 'pass_fail' ? true : null }));
    const res = await w.req('POST', `/api/qc/units/${id}/inspect`, w.staff.QC, { results });
    expect(res.json().unitStatus).toBe('packing');
  }
});

afterAll(async () => {
  await w.app.close();
  await pool.end();
});

describe('packing', () => {
  let pkg: PackageDetailDto;

  it('buat koli dengan kode otomatis per project', async () => {
    pkg = (await w.req('POST', `/api/projects/${projectId}/packages`, w.staff.PACKING)).json();
    expect(pkg.code).toBe(`${(await project()).code}-K0001`);
    expect(pkg.status).toBe('open');
    expect((await w.req('POST', `/api/projects/${projectId}/packages`, w.staff.QC)).statusCode).toBe(403);
  });

  it('unit tanpa kelengkapan wajib ditolak masuk koli', async () => {
    const r = (await w.req('POST', `/api/packages/${pkg.id}/units`, w.staff.PACKING, { serialNumbers: [sns[0]] })).json() as PackResultDto;
    expect(r.added).toBe(0);
    expect(r.errors[0]!.message).toContain('Remote');
  });

  it('scan unit ke koli: SN tidak dikenal / ganda dilaporkan', async () => {
    for (const [i, id] of unitIds.entries()) {
      await w.req('POST', `/api/units/${id}/accessories`, w.staff.PACKING, { name: 'Remote', serialNumber: `RMT-${i}` });
    }
    const r = (await w.req('POST', `/api/packages/${pkg.id}/units`, w.staff.PACKING, { serialNumbers: [sns[0], sns[1], 'TIDAK-ADA'] })).json() as PackResultDto;
    expect(r.added).toBe(2);
    expect(r.errors).toEqual([{ serialNumber: 'TIDAK-ADA', message: 'Serial number tidak ditemukan' }]);
    expect(r.package.units[0]!.accessories[0]!.name).toBe('Remote');
    const again = (await w.req('POST', `/api/packages/${pkg.id}/units`, w.staff.PACKING, { serialNumbers: [sns[0]] })).json() as PackResultDto;
    expect(again.errors[0]!.message).toBe('Sudah ada di koli ini');
  });

  it('keluarkan unit dari koli terbuka', async () => {
    const p = (await w.req('DELETE', `/api/packages/${pkg.id}/units/${unitIds[1]}`, w.staff.PACKING)).json() as PackageDetailDto;
    expect(p.units).toHaveLength(1);
  });

  it('segel koli → unit pindah ke pengiriman; koli tersegel tidak bisa ditambah', async () => {
    await w.req('POST', `/api/packages/${pkg.id}/units`, w.staff.PACKING, { serialNumbers: [sns[1]] });
    const sealed = (await w.req('POST', `/api/packages/${pkg.id}/seal`, w.staff.PACKING, { weightKg: 85.5 })).json() as PackageDetailDto;
    expect(sealed).toMatchObject({ status: 'sealed', weightKg: 85.5, unitCount: 2 });
    expect((await project()).counts).toEqual({ packing: 2, shipping: 2 });
    const r = await w.req('POST', `/api/packages/${pkg.id}/units`, w.staff.PACKING, { serialNumbers: [sns[2]] });
    expect(r.statusCode).toBe(400);
  });

  it('buka segel mengembalikan unit ke packing, lalu segel lagi', async () => {
    await w.req('POST', `/api/packages/${pkg.id}/unseal`, w.staff.PACKING);
    expect((await project()).counts).toEqual({ packing: 4 });
    await w.req('POST', `/api/packages/${pkg.id}/seal`, w.staff.PACKING, {});
    expect((await project()).counts).toEqual({ packing: 2, shipping: 2 });
  });

  it('koli kosong tidak bisa disegel dan bisa dihapus', async () => {
    const empty = (await w.req('POST', `/api/projects/${projectId}/packages`, w.staff.PACKING)).json() as PackageDetailDto;
    expect((await w.req('POST', `/api/packages/${empty.id}/seal`, w.staff.PACKING, {})).statusCode).toBe(400);
    expect((await w.req('DELETE', `/api/packages/${empty.id}`, w.staff.PACKING)).statusCode).toBe(204);
  });
});

async function project() {
  return (await w.req('GET', `/api/projects/${projectId}`, w.admin)).json() as ProjectDetailDto;
}

describe('pengiriman & instalasi', () => {
  let shipment: ShipmentDetailDto;
  let courierId: number;

  beforeAll(async () => {
    courierId = (await w.req('GET', '/api/master/couriers', w.admin)).json().data[0].id;
  });

  it('buat pengiriman dengan nomor surat jalan otomatis', async () => {
    shipment = (await w.req('POST', `/api/projects/${projectId}/shipments`, w.staff.LOGISTICS)).json();
    expect(shipment.code).toBe(`SJ-${(await project()).code}-001`);
    expect(shipment.status).toBe('preparing');
  });

  it('scan koli: koli terbuka/tidak dikenal ditolak', async () => {
    const open = (await w.req('POST', `/api/projects/${projectId}/packages`, w.staff.PACKING)).json() as PackageDetailDto;
    const pkgs = (await w.req('GET', `/api/projects/${projectId}/packages?status=sealed`, w.admin)).json() as PackageDetailDto[];
    const r = (await w.req('POST', `/api/shipments/${shipment.id}/packages`, w.staff.LOGISTICS, { codes: [pkgs[0]!.code.toLowerCase(), open.code, 'X-1'] })).json();
    expect(r.shipment.packages).toHaveLength(1);
    expect(r.errors.map((e: { message: string }) => e.message)).toEqual(['Koli belum disegel', 'Koli tidak ditemukan']);
  });

  it('kirim: wajib ekspedisi; setelah dikirim tidak bisa tambah koli', async () => {
    expect((await w.req('POST', `/api/shipments/${shipment.id}/ship`, w.staff.LOGISTICS, {})).statusCode).toBe(400);
    const s = (await w.req('POST', `/api/shipments/${shipment.id}/ship`, w.staff.LOGISTICS, { courierId, trackingNumber: 'JNE123' })).json() as ShipmentDetailDto;
    expect(s).toMatchObject({ status: 'shipped', trackingNumber: 'JNE123', packageCount: 1, unitCount: 2 });
    expect((await w.req('POST', `/api/shipments/${shipment.id}/packages`, w.staff.LOGISTICS, { codes: ['X'] })).statusCode).toBe(400);
  });

  it('diterima (BAST) → unit lanjut ke instalasi', async () => {
    const s = (await w.req('POST', `/api/shipments/${shipment.id}/deliver`, w.staff.LOGISTICS, { receivedByName: 'Pak Budi (Dinas)' })).json() as ShipmentDetailDto;
    expect(s.status).toBe('delivered');
    expect(s.receivedByName).toBe('Pak Budi (Dinas)');
    expect((await project()).counts).toEqual({ packing: 2, installation: 2 });
    const u = (await w.req('GET', `/api/units/${unitIds[0]}`, w.admin)).json() as UnitDetailDto;
    expect(u.logs[0]!.note).toContain('Pak Budi');
  });

  it('instalasi → selesai; project otomatis selesai setelah semua unit selesai', async () => {
    const r = await w.req('POST', '/api/work/installation/complete', w.staff.LOGISTICS, { unitIds: [unitIds[0], unitIds[1]], location: 'SDN 1 Ruang Kelas 3' });
    expect(r.json().moved).toBe(2);
    expect((await project()).status).toBe('in_progress');

    // Sisa 2 unit: packing → kirim → terima → instalasi.
    const pkg = (await w.req('POST', `/api/projects/${projectId}/packages`, w.staff.PACKING)).json() as PackageDetailDto;
    await w.req('POST', `/api/packages/${pkg.id}/units`, w.staff.PACKING, { serialNumbers: [sns[2], sns[3]] });
    await w.req('POST', `/api/packages/${pkg.id}/seal`, w.staff.PACKING, {});
    const s2 = (await w.req('POST', `/api/projects/${projectId}/shipments`, w.staff.LOGISTICS)).json() as ShipmentDetailDto;
    expect(s2.code).toMatch(/-002$/);
    await w.req('POST', `/api/shipments/${s2.id}/packages`, w.staff.LOGISTICS, { codes: [pkg.code] });
    await w.req('POST', `/api/shipments/${s2.id}/ship`, w.staff.LOGISTICS, { courierId });
    await w.req('POST', `/api/shipments/${s2.id}/deliver`, w.staff.LOGISTICS, { receivedByName: 'Bu Ani' });
    await w.req('POST', '/api/work/installation/complete', w.staff.LOGISTICS, { unitIds: [unitIds[2], unitIds[3]], location: 'SDN 2' });

    const p = await project();
    expect(p.counts).toEqual({ completed: 4 });
    expect(p.status).toBe('completed');
  });
});
