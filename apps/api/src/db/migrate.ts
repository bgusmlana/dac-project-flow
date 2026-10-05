// CLI: pnpm db:migrate
import { runMigrations } from './migrator.js';
import { pool } from './index.js';

await runMigrations();
console.log('Migrasi selesai');
await pool.end();
