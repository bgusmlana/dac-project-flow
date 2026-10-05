// CLI: pnpm db:seed
import { db, pool } from './index.js';
import { seedDivisions, seedSuperAdmin } from './seed-data.js';
import { seedMasterData } from './seed-master.js';

const username = process.env.SEED_ADMIN_USERNAME ?? 'admin';
const password = process.env.SEED_ADMIN_PASSWORD ?? 'admin12345';

await seedDivisions(db);
await seedSuperAdmin(db, username, password);
await seedMasterData(db);
console.log(`Seed selesai. Login Super Admin: ${username} (segera ganti password default)`);
await pool.end();
