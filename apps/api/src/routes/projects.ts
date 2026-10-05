import {
  addAccessorySchema,
  addUnitsSchema,
  canManageProjects,
  listProjectsQuerySchema,
  listUnitsQuerySchema,
  projectItemSchema,
  projectSchema,
  projectStatusSchema,
  updateUnitFieldsSchema,
} from '@manpro/shared';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { db } from '../db/index.js';
import { badRequest, forbidden } from '../lib/errors.js';
import { pid } from '../lib/public-id.js';
import { actorOf } from '../plugins/auth.js';
import * as imports from '../services/imports.js';
import * as projects from '../services/projects.js';
import * as units from '../services/units.js';

const id = z.coerce.number().int().positive();
const projectParams = z.object({ id: pid('project') });
const itemParams = z.object({ id: pid('project'), itemId: id });
const unitParams = z.object({ id: pid('unit') });

function projectManager(request: FastifyRequest) {
  const actor = actorOf(request);
  if (!canManageProjects(actor)) throw forbidden('Hanya Super Admin, Manager, dan divisi Admin Project yang boleh mengubah project');
  return actor;
}

export async function projectRoutes(app: FastifyInstance) {
  // ---- Project -----------------------------------------------------------
  app.get('/api/projects', async (request) => {
    actorOf(request);
    return projects.listProjects(db, listProjectsQuerySchema.parse(request.query));
  });

  app.post('/api/projects', async (request, reply) => {
    const actor = projectManager(request);
    return reply.status(201).send(await projects.createProject(db, actor, projectSchema.parse(request.body), request.ip));
  });

  app.get('/api/projects/:id', async (request) => {
    actorOf(request);
    return projects.getProject(db, projectParams.parse(request.params).id);
  });

  app.put('/api/projects/:id', async (request) => {
    const actor = projectManager(request);
    return projects.updateProject(db, actor, projectParams.parse(request.params).id, projectSchema.parse(request.body), request.ip);
  });

  app.patch('/api/projects/:id/status', async (request) => {
    const actor = projectManager(request);
    const { status } = projectStatusSchema.parse(request.body);
    return projects.setProjectStatus(db, actor, projectParams.parse(request.params).id, status, request.ip);
  });

  app.get('/api/user-options', async (request) => {
    actorOf(request);
    return projects.userOptions(db);
  });

  // ---- Item --------------------------------------------------------------
  app.post('/api/projects/:id/items', async (request, reply) => {
    const actor = projectManager(request);
    const p = projectParams.parse(request.params);
    return reply.status(201).send(await projects.addProjectItem(db, actor, p.id, projectItemSchema.parse(request.body), request.ip));
  });

  app.put('/api/projects/:id/items/:itemId', async (request) => {
    const actor = projectManager(request);
    const p = itemParams.parse(request.params);
    return projects.updateProjectItem(db, actor, p.id, p.itemId, projectItemSchema.parse(request.body), request.ip);
  });

  app.delete('/api/projects/:id/items/:itemId', async (request) => {
    const actor = projectManager(request);
    const p = itemParams.parse(request.params);
    return projects.deleteProjectItem(db, actor, p.id, p.itemId, request.ip);
  });

  // ---- Unit --------------------------------------------------------------
  app.get('/api/projects/:id/units', async (request) => {
    actorOf(request);
    return units.listUnits(db, projectParams.parse(request.params).id, listUnitsQuerySchema.parse(request.query));
  });

  app.post('/api/projects/:id/items/:itemId/units', async (request) => {
    const actor = projectManager(request);
    const p = itemParams.parse(request.params);
    await projects.ensureProjectOpen(db, p.id);
    const { serialNumbers } = addUnitsSchema.parse(request.body);
    return units.addUnits(db, actor, p.id, p.itemId, serialNumbers.map((serialNumber, i) => ({ row: i + 1, serialNumber })));
  });

  app.get('/api/projects/:id/items/:itemId/import-template', async (request, reply) => {
    actorOf(request);
    const p = itemParams.parse(request.params);
    const buf = await imports.unitImportTemplate(db, p.id, p.itemId);
    return reply
      .header('content-type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .header('content-disposition', `attachment; filename="template-unit-item-${p.itemId}.xlsx"`)
      .send(buf);
  });

  app.post('/api/projects/:id/items/:itemId/import', async (request, reply) => {
    const actor = projectManager(request);
    const p = itemParams.parse(request.params);
    await projects.ensureProjectOpen(db, p.id);
    const file = await request.file();
    if (!file) throw badRequest('File belum dipilih');
    const data = await file.toBuffer();
    return reply.status(202).send(await imports.createUnitImport(db, actor, p.id, p.itemId, { filename: file.filename, data }));
  });

  app.get('/api/projects/:id/imports', async (request) => {
    actorOf(request);
    return imports.listImportJobs(db, projectParams.parse(request.params).id);
  });

  app.get('/api/imports/:id', async (request) => {
    actorOf(request);
    return imports.getImportJob(db, z.object({ id }).parse(request.params).id);
  });

  app.get('/api/units/lookup', async (request) => {
    actorOf(request);
    const { sn } = z.object({ sn: z.string().trim().min(1) }).parse(request.query);
    return units.lookupUnit(db, sn);
  });

  app.get('/api/units/:id', async (request) => {
    actorOf(request);
    return units.getUnit(db, unitParams.parse(request.params).id);
  });

  app.put('/api/units/:id/fields', async (request) => {
    const { customFields } = updateUnitFieldsSchema.parse(request.body);
    return units.updateUnitFields(db, actorOf(request), unitParams.parse(request.params).id, customFields, request.ip);
  });

  app.post('/api/units/:id/fields/:key/reveal', async (request) => {
    const p = z.object({ id: pid('unit'), key: z.string() }).parse(request.params);
    return units.revealUnitSecret(db, actorOf(request), p.id, p.key, request.ip);
  });

  app.post('/api/units/:id/accessories', async (request) => {
    return units.addAccessory(db, actorOf(request), unitParams.parse(request.params).id, addAccessorySchema.parse(request.body), request.ip);
  });

  app.delete('/api/units/:id/accessories/:accessoryId', async (request) => {
    const p = z.object({ id: pid('unit'), accessoryId: id }).parse(request.params);
    return units.removeAccessory(db, actorOf(request), p.id, p.accessoryId, request.ip);
  });

  app.delete('/api/units/:id', async (request, reply) => {
    await units.deleteUnit(db, actorOf(request), unitParams.parse(request.params).id, request.ip);
    return reply.status(204).send();
  });
}
