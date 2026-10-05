import { migrate } from 'drizzle-orm/mysql2/migrator';
import { fileURLToPath } from 'node:url';
import { db } from './index.js';

// Di production (hasil bundle) folder migrasi diatur lewat MIGRATIONS_DIR.
const migrationsFolder = process.env.MIGRATIONS_DIR ?? fileURLToPath(new URL('../../drizzle', import.meta.url));

export async function runMigrations() {
  await migrate(db, { migrationsFolder });
}
