import { ATTACHMENT_ENTITY_TYPES, inspectSchema, lotDecisionSchema } from '@manpro/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../db/index.js';
import { badRequest } from '../lib/errors.js';
import { pid } from '../lib/public-id.js';
import { actorOf } from '../plugins/auth.js';
import * as attachments from '../services/attachments.js';
import * as qc from '../services/qc.js';

const id = z.coerce.number().int().positive();

export async function qcRoutes(app: FastifyInstance) {
  // ---- QC per unit -------------------------------------------------------
  app.get('/api/qc/units/:id', async (request) => {
    actorOf(request);
    return qc.getQcForm(db, z.object({ id: pid('unit') }).parse(request.params).id);
  });

  app.post('/api/qc/units/:id/inspect', async (request) => {
    const p = z.object({ id: pid('unit') }).parse(request.params);
    return qc.inspect(db, actorOf(request), p.id, inspectSchema.parse(request.body), request.ip);
  });

  // ---- Lot (sampling) ----------------------------------------------------
  app.get('/api/projects/:id/lots', async (request) => {
    actorOf(request);
    return qc.listLots(db, z.object({ id: pid('project') }).parse(request.params).id);
  });

  app.post('/api/projects/:id/lots', async (request, reply) => {
    const p = z.object({ id: pid('project') }).parse(request.params);
    return reply.status(201).send(await qc.createLot(db, actorOf(request), p.id, request.ip));
  });

  app.get('/api/lots/:id', async (request) => {
    actorOf(request);
    return qc.getLot(db, z.object({ id }).parse(request.params).id);
  });

  app.post('/api/lots/:id/decide', async (request) => {
    const p = z.object({ id }).parse(request.params);
    return qc.decideLot(db, actorOf(request), p.id, lotDecisionSchema.parse(request.body), request.ip);
  });

  // ---- Lampiran / foto ---------------------------------------------------
  // entityId = ID publik (unit/koli/pengiriman) atau angka (lot, pemeriksaan QC), diterjemahkan sesuai jenisnya.
  const target = z
    .object({
      entityType: z.enum(ATTACHMENT_ENTITY_TYPES),
      entityId: z.string().min(1).max(64),
      category: z.string().trim().min(1).max(30).default('foto'),
    })
    .transform((t) => ({ ...t, entityId: attachments.decodeEntityId(t.entityType, t.entityId) }));

  app.get('/api/attachments', async (request) => {
    actorOf(request);
    const q = target.parse({ category: 'foto', ...(request.query as object) });
    const { category } = z.object({ category: z.string().trim().max(30).optional() }).parse(request.query);
    return attachments.listAttachments(db, q.entityType, q.entityId, category);
  });

  app.post('/api/attachments', async (request, reply) => {
    const actor = actorOf(request);
    const q = target.parse(request.query);
    const file = await request.file();
    if (!file) throw badRequest('File belum dipilih');
    const data = await file.toBuffer();
    return reply.status(201).send(await attachments.uploadAttachment(db, actor, q, { filename: file.filename, mimetype: file.mimetype, data }, request.ip));
  });

  app.get('/api/attachments/:id/file', async (request, reply) => {
    actorOf(request);
    const p = z.object({ id: pid('attachment') }).parse(request.params);
    const { thumb } = z.object({ thumb: z.string().optional() }).parse(request.query);
    const f = await attachments.readAttachment(db, p.id, thumb === '1');
    return reply
      .header('content-type', f.mimeType)
      .header('cache-control', 'private, max-age=86400')
      .header('content-disposition', `inline; filename="${encodeURIComponent(f.name)}"`)
      .send(f.data);
  });

  app.delete('/api/attachments/:id', async (request, reply) => {
    await attachments.deleteAttachment(db, actorOf(request), z.object({ id: pid('attachment') }).parse(request.params).id, request.ip);
    return reply.status(204).send();
  });
}
