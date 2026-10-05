import type { ActivityLogDto, Paginated, QcFormDto, WorkHistoryItemDto, WorkSummaryDto } from '@manpro/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pool } from '../src/db/index.js';
import { localToday } from '../src/lib/time.js';
import { buildWorld, type Headers, type World } from './fixtures.js';
import { divisionId, login, setupTestApp } from './helpers.js';

let w: World;
let leaderQc: Headers;
let unitIds: string[];

function answers(form: QcFormDto, fail = false) {
  return form.items.map((i, n) => ({
    itemId: i.id,
    passed: i.inputType === 'pass_fail' ? !(fail && n === 0) : null,
    value: i.inputType === 'number' ? '55' : null,
  }));
}

beforeAll(async () => {
  w = await buildWorld(await setupTestApp());
  const qcDiv = await divisionId(w.app, w.admin, 'QC');
  await w.req('POST', '/api/users', w.admin, { name: 'Leader QC', username: 'leader.qc.hist', password: 'password123', role: 'leader', divisionId: qcDiv });
  leaderQc = (await login(w.app, 'leader.qc.hist', 'password123')).headers;

  unitIds = (await w.makeProject({ typeCode: 'LAPTOP', count: 3, prefix: 'HIST' })).unitIds;
  const types = (await w.req('GET', '/api/master/activation-types?pageSize=100', w.admin)).json().data as { id: number; name: string }[];
  const winOem = types.find((t) => t.name === 'Windows 11 Pro OEM')!.id;
  expect((await w.req('POST', '/api/work/activation/bulk', w.staff.ACTIVATION, { unitIds, activationTypeId: winOem, withKey: false, complete: true })).statusCode).toBe(200);

  const form = (await w.req('GET', `/api/qc/units/${unitIds[0]}`, w.staff.QC)).json() as QcFormDto;
  expect((await w.req('POST', `/api/qc/units/${unitIds[0]}/inspect`, w.staff.QC, { results: answers(form) })).statusCode).toBe(200);
  expect((await w.req('POST', `/api/qc/units/${unitIds[1]}/inspect`, w.staff.QC, { results: answers(form, true), notes: 'Layar bergaris' })).statusCode).toBe(200);
  expect((await w.req('POST', `/api/qc/units/${unitIds[2]}/inspect`, w.staff.QC, { results: answers(form, true), notes: 'Aktivasi gagal', reworkTo: 'activation' })).statusCode).toBe(200);
});

afterAll(async () => {
  await w.app.close();
  await pool.end();
});

const list = async (h: Headers, qs = '') => (await w.req('GET', `/api/work-history?search=HIST${qs}`, h)).json() as Paginated<WorkHistoryItemDto>;

describe('riwayat pekerjaan', () => {
  it('staff QC hanya melihat pekerjaannya sendiri, termasuk gagal QC yang tetap di QC', async () => {
    const r = await list(w.staff.QC);
    expect(r.total).toBe(3);
    expect(r.data.map((d) => d.action).sort()).toEqual(['advance', 'qc_fail', 'rework']);
    expect(r.data.every((d) => d.userName === 'Staff QC')).toBe(true);
  });

  it('staff Aktivasi hanya melihat 3 aktivasi miliknya', async () => {
    const r = await list(w.staff.ACTIVATION);
    expect(r.total).toBe(3);
    expect(r.data.every((d) => d.fromStatus === 'activation' && d.action === 'advance')).toBe(true);
  });

  it('leader QC melihat pekerjaan divisi QC saja, tidak bisa mengintip divisi lain', async () => {
    expect((await list(leaderQc)).total).toBe(3);
    const users = (await w.req('GET', '/api/work-history/users', leaderQc)).json() as { divisionName: string }[];
    expect(users.every((u) => u.divisionName === 'QC')).toBe(true);
    // Filter divisi lain diabaikan untuk leader.
    const activationDiv = await divisionId(w.app, w.admin, 'ACTIVATION');
    expect((await list(leaderQc, `&divisionId=${activationDiv}`)).total).toBe(3);
  });

  it('super admin melihat semua, bisa filter tahap & hasil', async () => {
    expect((await list(w.admin)).total).toBe(3 /* didaftarkan */ + 3 /* aktivasi */ + 3 /* QC */);
    expect((await list(w.admin, '&stage=qc')).total).toBe(3);
    expect((await list(w.admin, '&action=create')).total).toBe(3);
  });

  it('filter project aktif', async () => {
    expect((await list(w.admin, '&projectStatus=active')).total).toBe(9);
    const projectId = (await list(w.admin)).data[0]!.projectId;
    await w.req('PATCH', `/api/projects/${projectId}/status`, w.admin, { status: 'cancelled' });
    expect((await list(w.admin, '&projectStatus=active')).total).toBe(0);
    await w.req('PATCH', `/api/projects/${projectId}/status`, w.admin, { status: 'in_progress' });
  });

  it('rekap per petugas per hari', async () => {
    const today = localToday();
    const s = (await w.req('GET', `/api/work-history/summary?search=HIST&from=${today}&to=${today}`, w.admin)).json() as WorkSummaryDto;
    const qc = s.byUser.find((u) => u.userName === 'Staff QC')!;
    expect(qc).toMatchObject({ advance: 1, qcPass: 1, rework: 2, total: 3 });
    expect(s.byDay.every((d) => d.date === today)).toBe(true);
  });

  it('rentang tanggal kemarin kosong; rentang terbalik ditolak', async () => {
    expect((await list(w.admin, '&from=2020-01-01&to=2020-01-02')).total).toBe(0);
    expect((await w.req('GET', '/api/work-history?from=2026-02-01&to=2026-01-01', w.admin)).statusCode).toBe(400);
  });

  it('export Excel', async () => {
    const res = await w.req('GET', '/api/work-history/export?search=HIST', w.admin);
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('spreadsheetml');
    expect(res.rawPayload.subarray(0, 2).toString()).toBe('PK');
  });
});

describe('log aktivitas', () => {
  it('hanya super admin & manager', async () => {
    expect((await w.req('GET', '/api/activity-logs', leaderQc)).statusCode).toBe(403);
    expect((await w.req('GET', '/api/activity-logs', w.staff.QC)).statusCode).toBe(403);
  });

  it('menampilkan perubahan data terbaru dengan filter', async () => {
    const r = (await w.req('GET', '/api/activity-logs?action=qc_inspect', w.admin)).json() as Paginated<ActivityLogDto>;
    expect(r.total).toBeGreaterThanOrEqual(3);
    expect(r.data[0]!.userName).toBe('Staff QC');
    const facets = (await w.req('GET', '/api/activity-logs/facets', w.admin)).json();
    expect(facets.actions).toContainEqual({ value: 'qc_inspect', label: 'Pemeriksaan QC' });
  });
});
