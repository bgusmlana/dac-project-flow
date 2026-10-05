import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../db/index.js';
import { pid } from '../lib/public-id.js';
import { actorOf } from '../plugins/auth.js';
import { getDashboard } from '../services/dashboard.js';
import { exportProjectUnits } from '../services/export.js';

export async function reportRoutes(app: FastifyInstance) {
  app.get('/api/dashboard', async (request) => {
    actorOf(request);
    return getDashboard(db);
  });

  app.get('/api/projects/:id/export', async (request, reply) => {
    actorOf(request);
    const { id } = z.object({ id: pid('project') }).parse(request.params);
    const { stream, fileName } = await exportProjectUnits(db, id);
    return reply
      .header('content-type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .header('content-disposition', `attachment; filename="${fileName}"`)
      .send(stream);
  });
}
