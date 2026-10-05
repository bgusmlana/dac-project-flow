import { addPackagesSchema, deliverSchema, installSchema, packUnitsSchema, sealPackageSchema, SHIPMENT_STATUSES, shipSchema } from '@manpro/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../db/index.js';
import { decodeIds, pid } from '../lib/public-id.js';
import { actorOf } from '../plugins/auth.js';
import * as packing from '../services/packing.js';
import * as shipping from '../services/shipping.js';

const id = z.coerce.number().int().positive();

export async function logisticsRoutes(app: FastifyInstance) {
  // ---- Packing -----------------------------------------------------------
  app.get('/api/projects/:id/packages', async (request) => {
    actorOf(request);
    const { status } = z.object({ status: z.string().optional() }).parse(request.query);
    return packing.listPackages(db, z.object({ id: pid('project') }).parse(request.params).id, status);
  });

  app.post('/api/projects/:id/packages', async (request, reply) => {
    return reply.status(201).send(await packing.createPackage(db, actorOf(request), z.object({ id: pid('project') }).parse(request.params).id, request.ip));
  });

  app.get('/api/packages/lookup', async (request) => {
    actorOf(request);
    return packing.findPackageByCode(db, z.object({ code: z.string().min(1) }).parse(request.query).code);
  });

  app.get('/api/packages/:id', async (request) => {
    actorOf(request);
    return packing.getPackage(db, z.object({ id: pid('package') }).parse(request.params).id);
  });

  app.post('/api/packages/:id/units', async (request) => {
    const p = z.object({ id: pid('package') }).parse(request.params);
    return packing.packUnits(db, actorOf(request), p.id, packUnitsSchema.parse(request.body).serialNumbers, request.ip);
  });

  app.delete('/api/packages/:id/units/:unitId', async (request) => {
    const p = z.object({ id: pid('package'), unitId: pid('unit') }).parse(request.params);
    return packing.unpackUnit(db, actorOf(request), p.id, p.unitId, request.ip);
  });

  app.post('/api/packages/:id/seal', async (request) => {
    const p = z.object({ id: pid('package') }).parse(request.params);
    return packing.sealPackage(db, actorOf(request), p.id, sealPackageSchema.parse(request.body ?? {}), request.ip);
  });

  app.post('/api/packages/:id/unseal', async (request) => {
    return packing.unsealPackage(db, actorOf(request), z.object({ id: pid('package') }).parse(request.params).id, request.ip);
  });

  app.delete('/api/packages/:id', async (request, reply) => {
    await packing.deletePackage(db, actorOf(request), z.object({ id: pid('package') }).parse(request.params).id, request.ip);
    return reply.status(204).send();
  });

  // ---- Pengiriman --------------------------------------------------------
  app.get('/api/shipments', async (request) => {
    actorOf(request);
    const q = z.object({ projectId: pid('project').optional(), status: z.enum(SHIPMENT_STATUSES).optional() }).parse(request.query);
    return shipping.listShipments(db, q);
  });

  app.post('/api/projects/:id/shipments', async (request, reply) => {
    return reply.status(201).send(await shipping.createShipment(db, actorOf(request), z.object({ id: pid('project') }).parse(request.params).id, request.ip));
  });

  app.get('/api/shipments/:id', async (request) => {
    actorOf(request);
    return shipping.getShipment(db, z.object({ id: pid('shipment') }).parse(request.params).id);
  });

  app.post('/api/shipments/:id/packages', async (request) => {
    const p = z.object({ id: pid('shipment') }).parse(request.params);
    return shipping.addPackages(db, actorOf(request), p.id, addPackagesSchema.parse(request.body).codes, request.ip);
  });

  app.delete('/api/shipments/:id/packages/:packageId', async (request) => {
    const p = z.object({ id: pid('shipment'), packageId: pid('package') }).parse(request.params);
    return shipping.removePackage(db, actorOf(request), p.id, p.packageId, request.ip);
  });

  app.post('/api/shipments/:id/ship', async (request) => {
    const p = z.object({ id: pid('shipment') }).parse(request.params);
    return shipping.shipShipment(db, actorOf(request), p.id, shipSchema.parse(request.body), request.ip);
  });

  app.post('/api/shipments/:id/deliver', async (request) => {
    const p = z.object({ id: pid('shipment') }).parse(request.params);
    return shipping.deliverShipment(db, actorOf(request), p.id, deliverSchema.parse(request.body), request.ip);
  });

  app.delete('/api/shipments/:id', async (request, reply) => {
    await shipping.deleteShipment(db, actorOf(request), z.object({ id: pid('shipment') }).parse(request.params).id, request.ip);
    return reply.status(204).send();
  });

  // ---- Instalasi ---------------------------------------------------------
  app.post('/api/work/installation/complete', async (request) => {
    const input = installSchema.parse(request.body);
    return shipping.installUnits(db, actorOf(request), { ...input, unitIds: decodeIds('unit', input.unitIds) }, request.ip);
  });
}
