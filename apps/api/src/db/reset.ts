// CLI: pnpm db:reset -- --yes
// Hapus SEMUA data di database lokal (semua tabel, foto/file upload, antrian Redis), lalu migrasi ulang.
// Hanya untuk laptop/pengujian. Ditolak di production.
import { rm } from 'node:fs/promises';
import { Redis } from 'ioredis';
import { env } from '../env.js';
import { pool } from './index.js';
import { runMigrations } from './migrator.js';

if (env.NODE_ENV === 'production') throw new Error('db:reset tidak boleh dijalankan di production');
if (!process.argv.includes('--yes')) {
  console.error('Semua data akan DIHAPUS. Jalankan ulang dengan: pnpm db:reset -- --yes');
  process.exit(1);
}

const dbName = new URL(env.DATABASE_URL).pathname.slice(1);
console.log(`Menghapus semua tabel di database "${dbName}"…`);
const conn = await pool.getConnection();
try {
  const [rows] = await conn.query('SELECT table_name AS name FROM information_schema.tables WHERE table_schema = DATABASE()');
  await conn.query('SET FOREIGN_KEY_CHECKS = 0');
  for (const { name } of rows as { name: string }[]) await conn.query(`DROP TABLE IF EXISTS \`${name}\``);
  await conn.query('SET FOREIGN_KEY_CHECKS = 1');
} finally {
  conn.release();
}

// Foto & file upload.
await rm(env.STORAGE_DIR, { recursive: true, force: true });

// Antrian job (hanya key milik aplikasi ini; Redis Laragon dipakai bersama project lain).
const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
const queuePrefix = env.NODE_ENV === 'test' ? 'manpro:manpro-test:*' : 'manpro:manpro:*';
let removed = 0;
for await (const keys of redis.scanStream({ match: queuePrefix, count: 500 }) as AsyncIterable<string[]>) {
  if (keys.length) removed += await redis.del(...keys);
}
redis.disconnect();

await runMigrations();
console.log(`Reset selesai: tabel dibuat ulang, file upload dihapus, ${removed} key antrian dihapus.`);
await pool.end();
