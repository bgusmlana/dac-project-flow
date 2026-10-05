// Build production: bundle kode API + paket @manpro/shared (TypeScript) menjadi JavaScript.
// Library lain dari node_modules tetap eksternal (dipasang lewat pnpm di server).
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
const external = Object.keys(pkg.dependencies).filter((d) => !d.startsWith('@manpro/'));

await build({
  entryPoints: ['src/server.ts', 'src/worker.ts', 'src/db/migrate.ts', 'src/db/seed.ts'],
  outdir: 'dist',
  entryNames: '[name]',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  // Subpath seperti "better-auth/node" dan "drizzle-orm/mysql2" juga eksternal.
  external: external.flatMap((d) => [d, `${d}/*`]),
  sourcemap: true,
  logLevel: 'info',
});
