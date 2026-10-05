import { Queue, Worker, type Job } from 'bullmq';
import { Redis } from 'ioredis';
import { env } from '../env.js';

/** Semua pekerjaan berat (import, export, olah foto) lewat satu antrian. */
export const QUEUE_NAME = env.NODE_ENV === 'test' ? 'manpro-test' : 'manpro';

// Redis Laragon dipakai bersama project lain, jadi semua key diberi awalan sendiri.
const prefix = 'manpro';

/**
 * BullMQ versi 6 butuh koneksi ioredis yang dibuat sendiri.
 * Queue dan Worker masing-masing punya koneksi (Worker memakai perintah blocking).
 */
function redis() {
  return new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
}

let queue: Queue | null = null;
export function getQueue(): Queue {
  queue ??= new Queue(QUEUE_NAME, { connection: redis(), prefix, defaultJobOptions: { removeOnComplete: 1000, removeOnFail: 1000 } });
  return queue;
}

export type JobHandler = (job: Job) => Promise<void>;
const handlers = new Map<string, JobHandler>();

/** Daftarkan fungsi pemroses untuk nama job tertentu. */
export function registerJob(name: string, handler: JobHandler) {
  handlers.set(name, handler);
}

export async function enqueue(name: string, data: Record<string, unknown>) {
  await getQueue().add(name, data);
}

let worker: Worker | null = null;
export function startWorker(): Worker {
  worker ??= new Worker(
    QUEUE_NAME,
    async (job) => {
      const handler = handlers.get(job.name);
      if (!handler) throw new Error(`Tidak ada pemroses untuk job ${job.name}`);
      await handler(job);
    },
    { connection: redis(), prefix, concurrency: 2 },
  );
  worker.on('error', (e) => console.error('[worker]', e.message));
  return worker;
}

export async function closeQueue() {
  const w = worker;
  const q = queue;
  worker = null;
  queue = null;
  await w?.close();
  await q?.close();
}
