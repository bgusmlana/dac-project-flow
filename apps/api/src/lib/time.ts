import { sql, type AnyColumn } from 'drizzle-orm';
import { env } from '../env.js';

const offsetMinutes = (() => {
  const [, sign, h, m] = /^([+-])(\d{2}):(\d{2})$/.exec(env.APP_TZ_OFFSET)!;
  return (sign === '-' ? -1 : 1) * (Number(h) * 60 + Number(m));
})();

/** Tanggal hari ini (YYYY-MM-DD) menurut zona waktu kerja, bukan zona waktu server. */
export function localToday(): string {
  return localDateOf(new Date());
}

/** Tanggal (YYYY-MM-DD) dari sebuah waktu menurut zona waktu kerja. */
export function localDateOf(d: Date): string {
  return new Date(d.getTime() + offsetMinutes * 60_000).toISOString().slice(0, 10);
}

/** Tambah/kurangi hari dari tanggal YYYY-MM-DD. */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Awal hari (jam 00:00 zona waktu kerja) sebagai waktu UTC. */
export function startOfLocalDay(date: string): Date {
  return new Date(`${date}T00:00:00${env.APP_TZ_OFFSET}`);
}

/** Rentang [awal `from`, awal hari setelah `to`) untuk filter tanggal. */
export function localRange(from: string, to: string): { start: Date; end: Date } {
  return { start: startOfLocalDay(from), end: startOfLocalDay(addDays(to, 1)) };
}

/** Ekspresi SQL: tanggal lokal (zona waktu kerja) dari kolom waktu UTC. */
export function localDaySql(col: AnyColumn) {
  return sql<string>`DATE(CONVERT_TZ(${col}, '+00:00', ${env.APP_TZ_OFFSET}))`;
}
