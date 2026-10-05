import {
  canAccessUserManagement,
  createUserSchema,
  listUsersQuerySchema,
  resetPasswordSchema,
  setActiveSchema,
  updateUserSchema,
} from '@manpro/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../db/index.js';
import { forbidden } from '../lib/errors.js';
import { actorOf } from '../plugins/auth.js';
import * as service from '../services/users.js';

const idParams = z.object({ id: z.string().min(1) });

export async function userRoutes(app: FastifyInstance) {
  app.addHook('preHandler', async (request) => {
    if (!canAccessUserManagement(actorOf(request))) throw forbidden();
  });

  app.get('/api/users', async (request) => {
    return service.listUsers(db, actorOf(request), listUsersQuerySchema.parse(request.query));
  });

  app.post('/api/users', async (request, reply) => {
    const user = await service.createUser(db, actorOf(request), createUserSchema.parse(request.body), request.ip);
    return reply.status(201).send(user);
  });

  app.put('/api/users/:id', async (request) => {
    const { id } = idParams.parse(request.params);
    return service.updateUser(db, actorOf(request), id, updateUserSchema.parse(request.body), request.ip);
  });

  app.patch('/api/users/:id/active', async (request) => {
    const { id } = idParams.parse(request.params);
    const { isActive } = setActiveSchema.parse(request.body);
    return service.setUserActive(db, actorOf(request), id, isActive, request.ip);
  });

  app.post('/api/users/:id/reset-password', async (request, reply) => {
    const { id } = idParams.parse(request.params);
    const { password } = resetPasswordSchema.parse(request.body);
    await service.resetUserPassword(db, actorOf(request), id, password, request.ip);
    return reply.status(204).send();
  });
}
