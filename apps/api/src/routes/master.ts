import {
  canConfigureProductTypes,
  canManageMasterData,
  createProductTypeSchema,
  customFieldsSchema,
  listMasterQuerySchema,
  listProductsQuerySchema,
  masterSchemas,
  productSchema,
  qcTemplateSchema,
  setActiveSchema,
  updateProductTypeSchema,
} from '@manpro/shared';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { db } from '../db/index.js';
import { forbidden, notFound } from '../lib/errors.js';
import { actorOf } from '../plugins/auth.js';
import * as master from '../services/master.js';
import * as productTypes from '../services/product-types.js';
import * as products from '../services/products.js';

const idParams = z.object({ id: z.coerce.number().int().positive() });
const kindParams = z.object({ kind: z.string() });
const includeInactiveQuery = z.object({ includeInactive: z.enum(['true', 'false']).optional() });

/** Actor yang boleh mengubah master data umum. */
function masterEditor(request: FastifyRequest) {
  const actor = actorOf(request);
  if (!canManageMasterData(actor)) throw forbidden('Hanya Super Admin, Manager, dan divisi Admin Project yang boleh mengubah master data');
  return actor;
}

/** Actor yang boleh mengubah konfigurasi jenis produk. */
function productTypeEditor(request: FastifyRequest) {
  const actor = actorOf(request);
  if (!canConfigureProductTypes(actor)) throw forbidden('Hanya Super Admin dan Manager yang boleh mengatur jenis produk');
  return actor;
}

function masterKind(request: FastifyRequest) {
  const { kind } = kindParams.parse(request.params);
  if (!master.isMasterKind(kind)) throw notFound('Jenis master data tidak dikenal');
  return kind;
}

export async function masterRoutes(app: FastifyInstance) {
  // ---- Master data sederhana: /api/master/:kind -------------------------
  app.get('/api/master/:kind', async (request) => {
    actorOf(request);
    return master.listMaster(db, masterKind(request), listMasterQuerySchema.parse(request.query));
  });

  app.post('/api/master/:kind', async (request, reply) => {
    const actor = masterEditor(request);
    const kind = masterKind(request);
    const input = masterSchemas[kind].parse(request.body);
    return reply.status(201).send(await master.createMaster(db, actor, kind, input, request.ip));
  });

  app.put('/api/master/:kind/:id', async (request) => {
    const actor = masterEditor(request);
    const kind = masterKind(request);
    const { id } = idParams.parse(request.params);
    return master.updateMaster(db, actor, kind, id, masterSchemas[kind].parse(request.body), request.ip);
  });

  app.patch('/api/master/:kind/:id/active', async (request) => {
    const actor = masterEditor(request);
    const kind = masterKind(request);
    const { id } = idParams.parse(request.params);
    return master.setMasterActive(db, actor, kind, id, setActiveSchema.parse(request.body).isActive, request.ip);
  });

  // ---- Katalog produk ----------------------------------------------------
  app.get('/api/products', async (request) => {
    actorOf(request);
    return products.listProducts(db, listProductsQuerySchema.parse(request.query));
  });

  app.post('/api/products', async (request, reply) => {
    const actor = masterEditor(request);
    return reply.status(201).send(await products.createProduct(db, actor, productSchema.parse(request.body), request.ip));
  });

  app.put('/api/products/:id', async (request) => {
    const actor = masterEditor(request);
    const { id } = idParams.parse(request.params);
    return products.updateProduct(db, actor, id, productSchema.parse(request.body), request.ip);
  });

  app.patch('/api/products/:id/active', async (request) => {
    const actor = masterEditor(request);
    const { id } = idParams.parse(request.params);
    return products.setProductActive(db, actor, id, setActiveSchema.parse(request.body).isActive, request.ip);
  });

  // ---- Jenis produk ------------------------------------------------------
  app.get('/api/product-types', async (request) => {
    actorOf(request);
    const { includeInactive } = includeInactiveQuery.parse(request.query);
    return productTypes.listProductTypes(db, includeInactive === 'true');
  });

  app.get('/api/product-types/:id', async (request) => {
    actorOf(request);
    return productTypes.getProductType(db, idParams.parse(request.params).id);
  });

  app.post('/api/product-types', async (request, reply) => {
    const actor = productTypeEditor(request);
    const input = createProductTypeSchema.parse(request.body);
    return reply.status(201).send(await productTypes.createProductType(db, actor, input, request.ip));
  });

  app.put('/api/product-types/:id', async (request) => {
    const actor = productTypeEditor(request);
    const { id } = idParams.parse(request.params);
    return productTypes.updateProductType(db, actor, id, updateProductTypeSchema.parse(request.body), request.ip);
  });

  app.put('/api/product-types/:id/custom-fields', async (request) => {
    const actor = productTypeEditor(request);
    const { id } = idParams.parse(request.params);
    return productTypes.replaceCustomFields(db, actor, id, customFieldsSchema.parse(request.body).fields, request.ip);
  });

  app.put('/api/product-types/:id/qc-template', async (request) => {
    const actor = productTypeEditor(request);
    const { id } = idParams.parse(request.params);
    return productTypes.saveQcTemplate(db, actor, id, qcTemplateSchema.parse(request.body), request.ip);
  });

  app.patch('/api/product-types/:id/active', async (request) => {
    const actor = productTypeEditor(request);
    const { id } = idParams.parse(request.params);
    return productTypes.setProductTypeActive(db, actor, id, setActiveSchema.parse(request.body).isActive, request.ip);
  });
}
