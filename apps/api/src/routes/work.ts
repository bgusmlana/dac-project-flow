import { addComponentSchema, STAGES, unitIdsSchema, workQueueQuerySchema } from '@manpro/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../db/index.js';
import { decodeId, decodeIds, encodeId, pid } from '../lib/public-id.js';
import { actorOf } from '../plugins/auth.js';
import * as assembling from '../services/assembling.js';
import * as work from '../services/work.js';

const id = z.coerce.number().int().positive();
const stageParams = z.object({ stage: z.enum(STAGES) });

export async function workRoutes(app: FastifyInstance) {
  // ---- Antrian lini produksi (semua tahap) --------------------------------
  app.get('/api/work/:stage', async (request) => {
    actorOf(request);
    const { stage } = stageParams.parse(request.params);
    const q = workQueueQuerySchema.parse(request.query);
    return work.workQueue(db, stage, { ...q, projectId: q.projectId ? decodeId('project', q.projectId) : undefined });
  });

  app.get('/api/work/:stage/ids', async (request) => {
    actorOf(request);
    const { stage } = stageParams.parse(request.params);
    const q = z.object({ projectId: pid('project'), limit: z.coerce.number().int().min(1).max(5000).default(5000) }).parse(request.query);
    return (await work.workQueueIds(db, stage, q.projectId, q.limit)).map((n) => encodeId('unit', n));
  });

  app.get('/api/work/:stage/projects', async (request) => {
    actorOf(request);
    return work.workProjects(db, stageParams.parse(request.params).stage);
  });

  // ---- Assembling --------------------------------------------------------
  app.post('/api/units/:id/components', async (request) => {
    const p = z.object({ id: pid('unit') }).parse(request.params);
    return assembling.addComponent(db, actorOf(request), p.id, addComponentSchema.parse(request.body), request.ip);
  });

  app.delete('/api/units/:id/components/:componentId', async (request) => {
    const p = z.object({ id: pid('unit'), componentId: id }).parse(request.params);
    return assembling.removeComponent(db, actorOf(request), p.id, p.componentId, request.ip);
  });

  app.post('/api/work/assembling/complete', async (request) => {
    const { unitIds, note } = unitIdsSchema.parse(request.body);
    return assembling.completeAssembling(db, actorOf(request), decodeIds('unit', unitIds), note);
  });
}
