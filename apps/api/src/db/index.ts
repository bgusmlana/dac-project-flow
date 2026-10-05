import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';
import { env } from '../env.js';
import * as schema from './schema.js';

export const pool = mysql.createPool({ uri: env.DATABASE_URL, connectionLimit: 10, timezone: 'Z' });

// Semua waktu disimpan & dibaca sebagai UTC. Tanpa ini, CURRENT_TIMESTAMP mengikuti zona waktu server MySQL
// (misalnya WIB) sementara aplikasi menganggapnya UTC, sehingga jam tampil meleset beberapa jam.
pool.pool.on('connection', (conn) => {
  conn.query("SET time_zone = '+00:00'");
});

export const db = drizzle(pool, { schema, mode: 'default' });

export type Db = typeof db;
/** Koneksi biasa atau transaksi. */
export type DbOrTx = Db | Parameters<Parameters<Db['transaction']>[0]>[0];
