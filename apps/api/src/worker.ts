// Worker queue terpisah untuk production (API dijalankan dengan RUN_WORKER=false).
import { registerJobs } from './app.js';
import { startWorker } from './lib/queue.js';

registerJobs();
const worker = startWorker();
console.log('Worker berjalan');

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => {
    await worker.close();
    process.exit(0);
  });
}
