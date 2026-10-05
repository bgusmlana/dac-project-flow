import type { AttachmentDto, InspectResultDto, LotDetailDto, QcFormDto, UnitDetailDto } from '@manpro/shared';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pool } from '../src/db/index.js';
import { buildWorld, type World } from './fixtures.js';
import { multipartBody, setupTestApp } from './helpers.js';

let w: World;
let winOem: number;

/** Bawa unit laptop dari aktivasi ke QC (aktivasi massal tanpa key). */
async function toQc(unitIds: string[]) {
  const res = await w.req('POST', '/api/work/activation/bulk', w.staff.ACTIVATION, { unitIds, activationTypeId: winOem, withKey: false, complete: true });
  expect(res.statusCode).toBe(200);
}

/** Jawaban checklist: semua lulus, kecuali poin di `failIdx`. */
function answers(form: QcFormDto, failIdx: number[] = []) {
  return form.items.map((i, n) => ({
    itemId: i.id,
    passed: i.inputType === 'pass_fail' ? !failIdx.includes(n) : null,
    value: i.inputType === 'number' ? '55' : null,
  }));
}

beforeAll(async () => {
  w = await buildWorld(await setupTestApp());
  const types = (await w.req('GET', '/api/master/activation-types?pageSize=100', w.admin)).json().data as { id: number; name: string }[];
  winOem = types.find((t) => t.name === 'Windows 11 Pro OEM')!.id;
});

afterAll(async () => {
  await w.app.close();
  await pool.end();
});

describe('QC per unit', () => {
  let unitIds: string[];
  let form: QcFormDto;

  beforeAll(async () => {
    unitIds = (await w.makeProject({ typeCode: 'LAPTOP', count: 3, prefix: 'QCU', optionalStages: ['assembling'] })).unitIds;
    // Lewati assembling cepat: catat komponen & selesaikan.
    const cats = (await w.req('GET', '/api/master/component-categories?pageSize=100', w.admin)).json().data as { id: number; name: string }[];
    const ram = cats.find((c) => c.name === 'RAM')!.id;
    for (const id of unitIds) await w.req('POST', `/api/units/${id}/components`, w.staff.ASSEMBLING, { componentCategoryId: ram, brand: 'A', model: 'B' });
    await w.req('POST', '/api/work/assembling/complete', w.staff.ASSEMBLING, { unitIds });
    await toQc(unitIds);
    form = (await w.req('GET', `/api/qc/units/${unitIds[0]}`, w.staff.QC)).json();
  });

  it('form berisi checklist aktif jenis produk & tujuan rework', () => {
    expect(form.items.length).toBeGreaterThan(5);
    expect(form.qcMode).toBe('per_unit');
    expect(form.reworkTargets).toEqual(['assembling', 'activation']);
  });

  it('divisi lain tidak boleh QC; poin wajib yang kosong ditolak', async () => {
    expect((await w.req('POST', `/api/qc/units/${unitIds[0]}/inspect`, w.staff.PACKING, { results: answers(form) })).statusCode).toBe(403);
    const partial = answers(form).slice(1);
    expect((await w.req('POST', `/api/qc/units/${unitIds[0]}/inspect`, w.staff.QC, { results: partial })).statusCode).toBe(400);
  });

  it('semua lulus → unit lanjut ke packing', async () => {
    const res = await w.req('POST', `/api/qc/units/${unitIds[0]}/inspect`, w.staff.QC, { results: answers(form) });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ result: 'pass', unitStatus: 'packing' });
  });

  it('gagal tanpa catatan ditolak; dengan catatan & tujuan rework → kembali ke aktivasi', async () => {
    const f = (await w.req('GET', `/api/qc/units/${unitIds[1]}`, w.staff.QC)).json() as QcFormDto;
    expect((await w.req('POST', `/api/qc/units/${unitIds[1]}/inspect`, w.staff.QC, { results: answers(f, [2]), reworkTo: 'activation' })).statusCode).toBe(400);
    const res = await w.req('POST', `/api/qc/units/${unitIds[1]}/inspect`, w.staff.QC, { results: answers(f, [2]), notes: 'Keyboard rusak', reworkTo: 'activation' });
    expect(res.json()).toMatchObject({ result: 'fail', unitStatus: 'activation' });
    const u = (await w.req('GET', `/api/units/${unitIds[1]}`, w.admin)).json() as UnitDetailDto;
    expect(u.logs[0]).toMatchObject({ action: 'rework', toStatus: 'activation' });
    expect(u.logs[0]!.note).toContain('Keyboard rusak');
  });

  it('gagal tanpa tujuan rework → tetap di QC; riwayat QC tersimpan', async () => {
    const f = (await w.req('GET', `/api/qc/units/${unitIds[2]}`, w.staff.QC)).json() as QcFormDto;
    const res = await w.req('POST', `/api/qc/units/${unitIds[2]}/inspect`, w.staff.QC, { results: answers(f, [0]), notes: 'Tidak menyala, cek ulang' });
    expect(res.json()).toMatchObject({ result: 'fail', unitStatus: 'qc' });
    const again = (await w.req('GET', `/api/qc/units/${unitIds[2]}`, w.staff.QC)).json() as QcFormDto;
    expect(again.history).toHaveLength(1);
    expect(again.history[0]!.results.length).toBeGreaterThan(0);
  });
});

describe('QC sampling per lot', () => {
  let projectId: string;
  let unitIds: string[];

  beforeAll(async () => {
    const made = await w.makeProject({
      typeCode: 'LAPTOP',
      count: 10,
      prefix: 'QCS',
      project: { qcMode: 'sampling', lotSize: 5, samplePercent: 40, maxSampleFail: 0 },
    });
    projectId = made.project.id;
    unitIds = made.unitIds;
    await toQc(unitIds);
  });

  it('inspeksi sebelum lot dibentuk ditolak', async () => {
    const f = (await w.req('GET', `/api/qc/units/${unitIds[0]}`, w.staff.QC)).json() as QcFormDto;
    expect(f.qcMode).toBe('sampling');
    expect((await w.req('POST', `/api/qc/units/${unitIds[0]}/inspect`, w.staff.QC, { results: answers(f) })).statusCode).toBe(400);
  });

  let lot1: LotDetailDto;
  let lot2: LotDetailDto;

  it('bentuk lot: ukuran & jumlah sampel sesuai pengaturan project', async () => {
    lot1 = (await w.req('POST', `/api/projects/${projectId}/lots`, w.staff.QC)).json();
    expect(lot1).toMatchObject({ code: 'LOT-001', size: 5, sampleSize: 2, status: 'sampling' });
    lot2 = (await w.req('POST', `/api/projects/${projectId}/lots`, w.staff.QC)).json();
    expect(lot2.code).toBe('LOT-002');
    expect((await w.req('POST', `/api/projects/${projectId}/lots`, w.staff.QC)).statusCode).toBe(400);
  });

  it('unit bukan sampel tidak bisa diperiksa', async () => {
    const sampleIds = new Set(lot1.samples.map((s) => s.unitId));
    const detail = (await w.req('GET', `/api/lots/${lot1.id}`, w.staff.QC)).json() as LotDetailDto;
    expect(detail.samples).toHaveLength(2);
    const lotUnits = (await w.req('GET', `/api/projects/${projectId}/units?pageSize=50`, w.admin)).json().data as { id: string }[];
    for (const u of lotUnits) {
      const f = (await w.req('GET', `/api/qc/units/${u.id}`, w.staff.QC)).json() as QcFormDto;
      if (f.lot?.id === lot1.id && !sampleIds.has(u.id)) {
        expect((await w.req('POST', `/api/qc/units/${u.id}/inspect`, w.staff.QC, { results: answers(f) })).statusCode).toBe(400);
        return;
      }
    }
    throw new Error('Tidak ada unit non-sampel di lot 1');
  });

  it('semua sampel lulus → seluruh unit lot lanjut ke packing', async () => {
    let last: InspectResultDto | null = null;
    for (const s of lot1.samples) {
      const f = (await w.req('GET', `/api/qc/units/${s.unitId}`, w.staff.QC)).json() as QcFormDto;
      last = (await w.req('POST', `/api/qc/units/${s.unitId}/inspect`, w.staff.QC, { results: answers(f) })).json();
    }
    expect(last!.lot).toMatchObject({ status: 'passed', inspected: 2, failed: 0 });
    const p = (await w.req('GET', `/api/projects/${projectId}`, w.admin)).json();
    expect(p.counts).toEqual({ packing: 5, qc: 5 });
  });

  it('sampel gagal melebihi batas → lot ditahan; staff tidak boleh memutuskan', async () => {
    const s = lot2.samples[0]!;
    const f = (await w.req('GET', `/api/qc/units/${s.unitId}`, w.staff.QC)).json() as QcFormDto;
    const r = (await w.req('POST', `/api/qc/units/${s.unitId}/inspect`, w.staff.QC, { results: answers(f, [0]), notes: 'Mati total', reworkTo: 'activation' })).json() as InspectResultDto;
    expect(r.lot?.status).toBe('on_hold');
    expect(r.unitStatus).toBe('qc');
    expect((await w.req('POST', `/api/lots/${lot2.id}/decide`, w.staff.QC, { action: 'release', note: 'coba' })).statusCode).toBe(403);
  });

  it('manager mengembalikan seluruh lot → semua unit lot kembali ke aktivasi', async () => {
    const res = await w.req('POST', `/api/lots/${lot2.id}/decide`, w.admin, { action: 'rework', reworkTo: 'activation', note: 'Banyak unit bermasalah' });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('reworked');
    const p = (await w.req('GET', `/api/projects/${projectId}`, w.admin)).json();
    expect(p.counts).toEqual({ packing: 5, activation: 5 });
  });
});

describe('foto dokumentasi', () => {
  it('upload foto → dikompres + thumbnail; bisa dilihat & dihapus', async () => {
    const [unitId] = (await w.makeProject({ typeCode: 'LAPTOP', count: 1, prefix: 'FOTO' })).unitIds;
    const png = await sharp({ create: { width: 2400, height: 1800, channels: 3, background: '#3366cc' } }).png().toBuffer();
    const { body, contentType } = multipartBody('file', 'foto.png', png, 'image/png');
    const res = await w.app.inject({
      method: 'POST',
      url: `/api/attachments?entityType=unit&entityId=${unitId}&category=qc`,
      headers: { ...w.staff.QC, 'content-type': contentType },
      payload: body,
    });
    expect(res.statusCode).toBe(201);
    const a = res.json() as AttachmentDto;

    const file = await w.app.inject({ method: 'GET', url: a.url, headers: w.staff.QC });
    expect(file.headers['content-type']).toBe('image/jpeg');
    const meta = await sharp(file.rawPayload).metadata();
    expect(meta.width).toBe(1600);
    const thumb = await w.app.inject({ method: 'GET', url: a.thumbUrl, headers: w.staff.QC });
    expect((await sharp(thumb.rawPayload).metadata()).width).toBe(320);

    const list = (await w.req('GET', `/api/attachments?entityType=unit&entityId=${unitId}&category=qc`, w.admin)).json();
    expect(list).toHaveLength(1);
    expect((await w.req('DELETE', `/api/attachments/${a.id}`, w.staff.PACKING)).statusCode).toBe(403);
    expect((await w.req('DELETE', `/api/attachments/${a.id}`, w.staff.QC)).statusCode).toBe(204);
  });

  it('file selain foto/PDF ditolak', async () => {
    const [unitId] = (await w.makeProject({ typeCode: 'LAPTOP', count: 1, prefix: 'FOTOX' })).unitIds;
    const { body, contentType } = multipartBody('file', 'x.exe', Buffer.from('MZ'), 'application/octet-stream');
    const res = await w.app.inject({ method: 'POST', url: `/api/attachments?entityType=unit&entityId=${unitId}`, headers: { ...w.staff.QC, 'content-type': contentType }, payload: body });
    expect(res.statusCode).toBe(400);
  });
});
