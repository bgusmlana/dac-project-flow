import { addActivationSchema, allocateKeysSchema, bulkActivateSchema, importKeysSchema, listKeysQuerySchema, unitIdsSchema } from '@manpro/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../db/index.js';
import { decodeId, decodeIdOrNull, decodeIds, pid } from '../lib/public-id.js';
import { actorOf } from '../plugins/auth.js';
import * as activation from '../services/activation.js';

const id = z.coerce.number().int().positive();

export async function activationRoutes(app: FastifyInstance) {
  // ---- Stok license key --------------------------------------------------
  app.get('/api/license-keys', async (request) => {
    actorOf(request);
    const q = listKeysQuerySchema.parse(request.query);
    return activation.listKeys(db, { ...q, projectId: q.projectId ? decodeId('project', q.projectId) : undefined });
  });

  app.get('/api/license-keys/stock', async (request) => {
    actorOf(request);
    return activation.keyStock(db);
  });

  app.post('/api/license-keys/import', async (request) => {
    const input = importKeysSchema.parse(request.body);
    return activation.importKeys(db, actorOf(request), { ...input, projectId: decodeIdOrNull('project', input.projectId) }, request.ip);
  });

  app.post('/api/license-keys/allocate', async (request) => {
    const input = allocateKeysSchema.parse(request.body);
    return activation.allocateKeys(
      db,
      actorOf(request),
      { ...input, fromProjectId: decodeIdOrNull('project', input.fromProjectId), toProjectId: decodeIdOrNull('project', input.toProjectId) },
      request.ip,
    );
  });

  app.post('/api/license-keys/:id/reveal', async (request) => {
    return activation.revealKey(db, actorOf(request), z.object({ id }).parse(request.params).id, request.ip);
  });

  app.patch('/api/license-keys/:id/status', async (request, reply) => {
    const p = z.object({ id }).parse(request.params);
    const { status } = z.object({ status: z.enum(['revoked', 'available']) }).parse(request.body);
    await activation.setKeyStatus(db, actorOf(request), p.id, status, request.ip);
    return reply.status(204).send();
  });

  // ---- Aktivasi per unit -------------------------------------------------
  app.post('/api/units/:id/activations', async (request) => {
    const p = z.object({ id: pid('unit') }).parse(request.params);
    return activation.addActivation(db, actorOf(request), p.id, addActivationSchema.parse(request.body), request.ip);
  });

  app.delete('/api/units/:id/activations/:activationId', async (request) => {
    const p = z.object({ id: pid('unit'), activationId: id }).parse(request.params);
    return activation.removeActivation(db, actorOf(request), p.id, p.activationId, request.ip);
  });

  app.post('/api/work/activation/complete', async (request) => {
    const { unitIds, note } = unitIdsSchema.parse(request.body);
    return activation.completeActivation(db, actorOf(request), decodeIds('unit', unitIds), note);
  });

  app.post('/api/work/activation/bulk', async (request) => {
    const input = bulkActivateSchema.parse(request.body);
    return activation.bulkActivate(db, actorOf(request), { ...input, unitIds: decodeIds('unit', input.unitIds) });
  });
}
