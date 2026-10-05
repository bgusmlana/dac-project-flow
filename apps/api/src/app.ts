import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import Fastify from 'fastify';
import { ZodError } from 'zod';
import { db } from './db/index.js';
import { env } from './env.js';
import { HttpError } from './lib/errors.js';
import { closeQueue, startWorker } from './lib/queue.js';
import { registerActor, registerAuthRoutes } from './plugins/auth.js';
import { activationRoutes } from './routes/activation.js';
import { commonRoutes } from './routes/common.js';
import { historyRoutes } from './routes/history.js';
import { logisticsRoutes } from './routes/logistics.js';
import { masterRoutes } from './routes/master.js';
import { projectRoutes } from './routes/projects.js';
import { qcRoutes } from './routes/qc.js';
import { reportRoutes } from './routes/reports.js';
import { workRoutes } from './routes/work.js';
import { userRoutes } from './routes/users.js';
import { registerImportJobs } from './services/imports.js';

/** Daftarkan semua pemroses job queue. Dipakai oleh API (RUN_WORKER=true) dan worker terpisah. */
export function registerJobs() {
  registerImportJobs(db);
}

export async function buildApp() {
  const app = Fastify({
    logger: env.NODE_ENV === 'test' ? false : { level: env.NODE_ENV === 'production' ? 'info' : 'debug' },
    // Header X-Forwarded-For hanya dipercaya kalau datang dari proxy di jaringan internal (Caddy di Docker, proxy Vite di laptop),
    // sehingga alamat IP asli tidak bisa dipalsukan client dari internet.
    trustProxy: 'loopback,uniquelocal',
    bodyLimit: 5 * 1024 * 1024,
  });

  await app.register(cors, { origin: env.WEB_ORIGIN, credentials: true });

  // Header keamanan untuk semua respons API.
  app.addHook('onSend', async (_request, reply) => {
    reply.header('x-content-type-options', 'nosniff');
    reply.header('x-frame-options', 'DENY');
    reply.header('referrer-policy', 'same-origin');
    reply.header('cross-origin-resource-policy', 'same-origin');
    reply.header('content-security-policy', "default-src 'none'; frame-ancestors 'none'");
    // Data API tidak boleh disimpan cache browser/proxy (kecuali file foto yang sudah mengatur sendiri).
    if (!reply.hasHeader('cache-control')) reply.header('cache-control', 'no-store');
    if (env.NODE_ENV === 'production') reply.header('strict-transport-security', 'max-age=31536000; includeSubDomains');
  });
  await app.register(multipart, { limits: { fileSize: 50 * 1024 * 1024, files: 1 } });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) {
      return reply.status(400).send({
        message: error.issues[0]?.message ?? 'Data tidak valid',
        issues: error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }
    if (error instanceof HttpError) {
      return reply.status(error.statusCode).send({ message: error.message });
    }
    const statusCode = (error as { statusCode?: number }).statusCode;
    if (statusCode && statusCode < 500) {
      return reply.status(statusCode).send({ message: (error as Error).message });
    }
    request.log.error(error);
    return reply.status(500).send({ message: 'Terjadi kesalahan pada server' });
  });

  await registerAuthRoutes(app);
  await registerActor(app);
  await app.register(commonRoutes);
  await app.register(userRoutes);
  await app.register(masterRoutes);
  await app.register(projectRoutes);
  await app.register(workRoutes);
  await app.register(activationRoutes);
  await app.register(qcRoutes);
  await app.register(logisticsRoutes);
  await app.register(reportRoutes);
  await app.register(historyRoutes);

  registerJobs();
  if (env.RUN_WORKER) startWorker();
  app.addHook('onClose', async () => closeQueue());

  return app;
}
