import { activityLogQuerySchema, canViewActivityLogs, workHistoryFilterSchema, workHistoryQuerySchema } from '@manpro/shared';
import type { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import { forbidden } from '../lib/errors.js';
import { decodeId } from '../lib/public-id.js';
import { actorOf } from '../plugins/auth.js';
import * as history from '../services/history.js';

/** ID project publik di filter → angka. */
function withProject<T extends { projectId?: string }>(q: T): Omit<T, 'projectId'> & { projectId?: number } {
  return { ...q, projectId: q.projectId ? decodeId('project', q.projectId) : undefined };
}

export async function historyRoutes(app: FastifyInstance) {
  // ---- Riwayat pekerjaan (Staff: sendiri, Leader: divisinya, Manager: semua) --------
  app.get('/api/work-history', async (request) => {
    return history.listWorkHistory(db, actorOf(request), withProject(workHistoryQuerySchema.parse(request.query)));
  });

  app.get('/api/work-history/summary', async (request) => {
    return history.workSummary(db, actorOf(request), withProject(workHistoryFilterSchema.parse(request.query)));
  });

  app.get('/api/work-history/users', async (request) => {
    return history.historyUsers(db, actorOf(request));
  });

  app.get('/api/work-history/export', async (request, reply) => {
    const { stream, fileName } = await history.exportWorkHistory(db, actorOf(request), withProject(workHistoryFilterSchema.parse(request.query)));
    return reply
      .header('content-type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .header('content-disposition', `attachment; filename="${fileName}"`)
      .send(stream);
  });

  // ---- Log aktivitas (Super Admin & Manager) ------------------------------------------
  app.get('/api/activity-logs', async (request) => {
    if (!canViewActivityLogs(actorOf(request))) throw forbidden();
    return history.listActivityLogs(db, activityLogQuerySchema.parse(request.query));
  });

  app.get('/api/activity-logs/facets', async (request) => {
    if (!canViewActivityLogs(actorOf(request))) throw forbidden();
    return history.activityLogFacets(db);
  });
}
