import type { Actor, DivisionCode, Role } from '@manpro/shared';
import { fromNodeHeaders } from 'better-auth/node';
import { eq } from 'drizzle-orm';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { auth } from '../auth.js';
import { db } from '../db/index.js';
import { divisions } from '../db/schema.js';
import { HttpError } from '../lib/errors.js';
import { closeLoginLimiter, loginBlockedFor, recordLoginFailure, recordLoginSuccess } from '../lib/login-limit.js';

declare module 'fastify' {
  interface FastifyRequest {
    actor: Actor | null;
    /** Session yang sedang dipakai (untuk ganti password tanpa logout dari perangkat ini). */
    sessionId: string | null;
  }
}

/** Meneruskan semua request /api/auth/* ke Better Auth. */
export async function registerAuthRoutes(app: FastifyInstance) {
  app.addHook('onClose', closeLoginLimiter);
  app.route({
    method: ['GET', 'POST'],
    url: '/api/auth/*',
    async handler(request, reply) {
      const url = new URL(request.url, `${request.protocol}://${request.headers.host ?? 'localhost'}`);

      // Batas percobaan login: dicek sebelum password diperiksa.
      const isSignIn = request.method === 'POST' && url.pathname === '/api/auth/sign-in/username';
      const username = isSignIn ? String((request.body as { username?: unknown } | undefined)?.username ?? '') : '';
      if (isSignIn) {
        const wait = await loginBlockedFor(username, request.ip);
        if (wait > 0) {
          return reply
            .status(429)
            .header('retry-after', String(wait))
            .send({ message: `Terlalu banyak percobaan login yang salah. Coba lagi dalam ${Math.ceil(wait / 60)} menit.` });
        }
      }

      const response = await auth.handler(
        new Request(url, {
          method: request.method,
          headers: fromNodeHeaders(request.headers),
          body: request.body ? JSON.stringify(request.body) : undefined,
        }),
      );
      if (isSignIn) {
        if (response.ok) await recordLoginSuccess(username);
        else if (response.status === 401 || response.status === 403) await recordLoginFailure(username, request.ip);
      }
      reply.status(response.status);
      response.headers.forEach((value, key) => {
        if (key !== 'set-cookie') reply.header(key, value);
      });
      const cookies = response.headers.getSetCookie();
      if (cookies.length) reply.header('set-cookie', cookies);
      return reply.send(response.body ? await response.text() : null);
    },
  });
}

/** Endpoint yang boleh dibuka tanpa login. */
const PUBLIC_PATHS = new Set(['/api/health']);

/** Mengisi request.actor dari session (null kalau belum login atau user nonaktif). */
export async function registerActor(app: FastifyInstance) {
  app.decorateRequest('actor', null);
  app.decorateRequest('sessionId', null);
  app.addHook('preHandler', async (request) => {
    if (request.url.startsWith('/api/auth/') || PUBLIC_PATHS.has(request.url.split('?')[0]!)) return;
    const session = await auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
    // Semua endpoint /api wajib login, dicek di sini sebelum input apa pun diproses.
    if (!session || session.user.isActive === false) throw new HttpError(401, 'Silakan login terlebih dahulu');
    request.sessionId = session.session.id;
    const divisionId = session.user.divisionId ?? null;
    request.actor = {
      id: session.user.id,
      role: session.user.role as Role,
      divisionId,
      divisionCode: divisionId === null ? null : await divisionCodeOf(divisionId),
    };
  });
}

/** Kode divisi jarang berubah, jadi disimpan di memori. */
const divisionCodeCache = new Map<number, DivisionCode>();

async function divisionCodeOf(divisionId: number): Promise<DivisionCode | null> {
  const cached = divisionCodeCache.get(divisionId);
  if (cached) return cached;
  const [row] = await db.select({ code: divisions.code }).from(divisions).where(eq(divisions.id, divisionId));
  if (row) divisionCodeCache.set(divisionId, row.code);
  return row?.code ?? null;
}

/** Ambil user yang sedang login. Melempar 401 kalau belum login. */
export function actorOf(request: FastifyRequest): Actor {
  if (!request.actor) throw new HttpError(401, 'Silakan login terlebih dahulu');
  return request.actor;
}
