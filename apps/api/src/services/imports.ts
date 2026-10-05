import type { Actor, ImportJobDto } from '@manpro/shared';
import type { Job } from 'bullmq';
import ExcelJS from 'exceljs';
import { desc, eq } from 'drizzle-orm';
import path from 'node:path';
import type { Db } from '../db/index.js';
import { customFieldDefinitions, importJobs, users } from '../db/schema.js';
import { badRequest, notFound } from '../lib/errors.js';
import { enqueue, registerJob } from '../lib/queue.js';
import { filePath, getFile, putFile } from '../lib/storage.js';
import { addUnits, getItem, type NewUnitRow } from './units.js';

const MAX_ERRORS = 1000;
export const MAX_IMPORT_ROWS = 200_000;

function toDto(j: typeof importJobs.$inferSelect): ImportJobDto {
  return {
    id: j.id,
    type: j.type,
    fileName: j.fileName,
    status: j.status,
    totalRows: j.totalRows,
    processedRows: j.processedRows,
    successRows: j.successRows,
    failedRows: j.failedRows,
    errors: j.errors,
    message: j.message,
    createdAt: j.createdAt.toISOString(),
  };
}

export async function getImportJob(db: Db, id: number) {
  const [j] = await db.select().from(importJobs).where(eq(importJobs.id, id));
  if (!j) throw notFound('Proses import tidak ditemukan');
  return toDto(j);
}

export async function listImportJobs(db: Db, projectId: number) {
  const rows = await db.select().from(importJobs).where(eq(importJobs.projectId, projectId)).orderBy(desc(importJobs.id)).limit(20);
  return rows.map(toDto);
}

// ---------------------------------------------------------------------------
// Template
// ---------------------------------------------------------------------------
async function templateColumns(db: Db, projectId: number, itemId: number) {
  const item = await getItem(db, projectId, itemId);
  const defs = await db
    .select()
    .from(customFieldDefinitions)
    .where(eq(customFieldDefinitions.productTypeId, item.productTypeId))
    .orderBy(customFieldDefinitions.sortOrder);
  return { item, defs };
}

/** File Excel kosong berisi kolom yang dikenali untuk item ini. */
export async function unitImportTemplate(db: Db, projectId: number, itemId: number): Promise<Buffer> {
  const { item, defs } = await templateColumns(db, projectId, itemId);
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Unit');
  const headers = ['serial_number', ...defs.map((d) => d.key), ...item.accessories.map((a) => `SN ${a}`)];
  ws.addRow(headers).font = { bold: true };
  ws.columns.forEach((c) => (c.width = 24));
  const info = wb.addWorksheet('Petunjuk');
  info.addRows([
    ['Petunjuk import unit'],
    [`Item: ${item.brand} ${item.model} (jumlah ${item.quantity})`],
    ['Isi sheet "Unit" mulai baris 2. Kolom serial_number wajib; kolom lain boleh kosong.'],
    ['Baris pertama (judul kolom) jangan diubah.'],
    [],
    ['Kolom', 'Keterangan'],
    ['serial_number', 'Serial number unit (wajib, tidak boleh ganda)'],
    ...defs.map((d) => [d.key, `${d.label}${d.inputType === 'select' ? ` — pilihan: ${(d.options ?? []).join(', ')}` : ''}${d.isSecret ? ' (rahasia, disimpan terenkripsi)' : ''}`]),
    ...item.accessories.map((a) => [`SN ${a}`, `Serial number kelengkapan ${a} (boleh kosong)`]),
  ]);
  info.getColumn(1).width = 24;
  info.getColumn(2).width = 80;
  return Buffer.from(await wb.xlsx.writeBuffer());
}

// ---------------------------------------------------------------------------
// Baca file
// ---------------------------------------------------------------------------
function cellText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') {
    const v = value as { text?: string; result?: unknown; richText?: { text: string }[] };
    if (v.richText) return v.richText.map((r) => r.text).join('').trim();
    if (v.text !== undefined) return String(v.text).trim();
    if (v.result !== undefined) return cellText(v.result);
    if (value instanceof Date) return value.toISOString().slice(0, 10);
  }
  return String(value).trim();
}

/** Parser CSV sederhana (mendukung tanda kutip), pemisah koma atau titik koma. */
function parseCsv(text: string): string[][] {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  const sep = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) {
      row.push(cell.trim());
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell.trim());
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) {
    row.push(cell.trim());
    rows.push(row);
  }
  return rows;
}

/** Baca semua baris dari file xlsx/csv. Baris pertama = judul kolom. */
async function readRows(key: string): Promise<string[][]> {
  if (key.toLowerCase().endsWith('.csv')) {
    return parseCsv((await getFile(key)).toString('utf8').replace(/^﻿/, ''));
  }
  const rows: string[][] = [];
  const reader = new ExcelJS.stream.xlsx.WorkbookReader(filePath(key), { worksheets: 'emit', sharedStrings: 'cache', styles: 'ignore', hyperlinks: 'ignore' });
  for await (const sheet of reader) {
    for await (const row of sheet) {
      const values = row.values as unknown[];
      // ExcelJS: index 0 kosong, kolom mulai dari 1. Isi sel kosong di tengah dengan ''.
      const cells: string[] = [];
      for (let c = 1; c < values.length; c++) cells.push(cellText(values[c]));
      rows[row.number - 1] = cells;
      if (rows.length > MAX_IMPORT_ROWS + 1) throw new Error(`File melebihi ${MAX_IMPORT_ROWS.toLocaleString('id-ID')} baris`);
    }
    break; // hanya sheet pertama
  }
  return Array.from(rows, (r) => r ?? []);
}

// ---------------------------------------------------------------------------
// Proses import
// ---------------------------------------------------------------------------
export async function createUnitImport(
  db: Db,
  actor: Actor,
  projectId: number,
  itemId: number,
  file: { filename: string; data: Buffer },
) {
  await getItem(db, projectId, itemId);
  const ext = path.extname(file.filename).toLowerCase();
  if (ext !== '.xlsx' && ext !== '.csv') throw badRequest('File harus berformat .xlsx atau .csv');
  const key = `imports/${Date.now()}-${crypto.randomUUID()}${ext}`;
  await putFile(key, file.data);
  const [res] = await db.insert(importJobs).values({
    type: 'units',
    projectId,
    projectItemId: itemId,
    fileName: file.filename,
    filePath: key,
    errors: [],
    createdBy: actor.id,
  });
  await enqueue('import-units', { importJobId: res.insertId });
  return getImportJob(db, res.insertId);
}

export function registerImportJobs(db: Db) {
  registerJob('import-units', async (job: Job) => {
    const id = Number(job.data.importJobId);
    const [j] = await db.select().from(importJobs).where(eq(importJobs.id, id));
    if (!j || j.status !== 'queued') return;
    await db.update(importJobs).set({ status: 'processing' }).where(eq(importJobs.id, id));
    try {
      const [creator] = await db.select().from(users).where(eq(users.id, j.createdBy!));
      if (!creator) throw new Error('User pembuat import tidak ditemukan');
      const actor: Actor = { id: creator.id, role: creator.role, divisionId: creator.divisionId };
      const { item, defs } = await templateColumns(db, j.projectId!, j.projectItemId!);

      const [header = [], ...data] = await readRows(j.filePath);
      const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
      const cols = header.map(norm);
      const snCol = cols.findIndex((c) => ['serial_number', 'serial number', 'sn', 'serial'].includes(c));
      if (snCol === -1) throw new Error('Kolom serial_number tidak ditemukan di baris pertama');
      const fieldCols = defs
        .map((d) => ({ key: d.key, idx: cols.findIndex((c) => c === norm(d.key) || c === norm(d.label)) }))
        .filter((f) => f.idx !== -1);
      const accCols = item.accessories
        .map((name) => ({ name, idx: cols.indexOf(norm(`SN ${name}`)) }))
        .filter((a) => a.idx !== -1);

      const rows: NewUnitRow[] = [];
      data.forEach((cells, i) => {
        if (cells.every((c) => !c)) return; // lewati baris kosong
        rows.push({
          row: i + 2,
          serialNumber: cells[snCol] ?? '',
          customFields: Object.fromEntries(fieldCols.filter((f) => cells[f.idx]).map((f) => [f.key, cells[f.idx]])),
          accessories: accCols.filter((a) => cells[a.idx]).map((a) => ({ name: a.name, serialNumber: cells[a.idx]! })),
        });
      });
      await db.update(importJobs).set({ totalRows: rows.length }).where(eq(importJobs.id, id));

      const result = await addUnits(db, actor, j.projectId!, j.projectItemId!, rows, async (done) => {
        await db.update(importJobs).set({ processedRows: done }).where(eq(importJobs.id, id));
      });
      await db
        .update(importJobs)
        .set({
          status: 'done',
          processedRows: rows.length,
          successRows: result.inserted,
          failedRows: result.errors.length,
          errors: result.errors.sort((a, b) => a.row - b.row).slice(0, MAX_ERRORS),
          message: result.errors.length > MAX_ERRORS ? `Hanya ${MAX_ERRORS} error pertama yang ditampilkan` : null,
        })
        .where(eq(importJobs.id, id));
    } catch (e) {
      await db
        .update(importJobs)
        .set({ status: 'failed', message: e instanceof Error ? e.message : String(e) })
        .where(eq(importJobs.id, id));
    }
  });
}
