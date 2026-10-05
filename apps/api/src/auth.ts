import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { username } from 'better-auth/plugins/username';
import { eq } from 'drizzle-orm';
import { db } from './db/index.js';
import { accounts, sessions, users, verifications } from './db/schema.js';
import { env } from './env.js';

export const auth = betterAuth({
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  basePath: '/api/auth',
  trustedOrigins: [env.WEB_ORIGIN],
  database: drizzleAdapter(db, {
    provider: 'mysql',
    schema: { user: users, session: sessions, account: accounts, verification: verifications },
  }),
  // Tidak ada pendaftaran mandiri: user dibuat oleh Leader/Manager/Super Admin.
  emailAndPassword: { enabled: true, disableSignUp: true, minPasswordLength: 8 },
  plugins: [username()],
  user: {
    additionalFields: {
      role: { type: 'string', input: false },
      divisionId: { type: 'number', required: false, input: false },
      isActive: { type: 'boolean', input: false },
    },
  },
  session: {
    expiresIn: 60 * 60 * 12, // 12 jam
    updateAge: 60 * 60,
  },
  advanced: {
    database: { generateId: () => crypto.randomUUID() },
  },
  databaseHooks: {
    session: {
      create: {
        // User yang dinonaktifkan tidak bisa login.
        before: async (session) => {
          const [user] = await db
            .select({ isActive: users.isActive })
            .from(users)
            .where(eq(users.id, session.userId));
          if (!user?.isActive) return false;
        },
      },
    },
  },
});

/** Cocokkan password dengan hash tersimpan (algoritma Better Auth). */
export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  const ctx = await auth.$context;
  return ctx.password.verify({ hash, password });
}

/** Hash password dengan algoritma yang sama seperti Better Auth. */
export async function hashPassword(password: string): Promise<string> {
  const ctx = await auth.$context;
  return ctx.password.hash(password);
}
