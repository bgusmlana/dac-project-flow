import { changePasswordSchema, updateProfileSchema, type DivisionDto, type MeDto } from '@manpro/shared';
import type { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import { divisions } from '../db/schema.js';
import { actorOf } from '../plugins/auth.js';
import { changeOwnPassword, getUser, updateOwnProfile } from '../services/users.js';

export async function commonRoutes(app: FastifyInstance) {
  app.get('/api/health', async () => ({ ok: true }));

  app.get('/api/me', async (request): Promise<MeDto> => {
    const user = (await getUser(db, actorOf(request).id))!;
    return {
      id: user.id,
      name: user.name,
      username: user.username,
      role: user.role,
      divisionId: user.divisionId,
      divisionCode: user.divisionCode,
      divisionName: user.divisionName,
    };
  });

  app.put('/api/me', async (request, reply) => {
    await updateOwnProfile(db, actorOf(request), updateProfileSchema.parse(request.body), request.ip);
    return reply.status(204).send();
  });

  app.post('/api/me/password', async (request, reply) => {
    await changeOwnPassword(db, actorOf(request), request.sessionId, changePasswordSchema.parse(request.body), request.ip);
    return reply.status(204).send();
  });

  app.get('/api/divisions', async (request): Promise<DivisionDto[]> => {
    const actor = actorOf(request);
    const rows = await db
      .select({ id: divisions.id, code: divisions.code, name: divisions.name })
      .from(divisions)
      .orderBy(divisions.id);
    // Leader hanya perlu melihat divisinya sendiri.
    return actor.role === 'leader' ? rows.filter((d) => d.id === actor.divisionId) : rows;
  });
}
