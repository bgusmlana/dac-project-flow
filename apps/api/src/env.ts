import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().min(1),
  BETTER_AUTH_SECRET: z.string().min(32, 'BETTER_AUTH_SECRET minimal 32 karakter'),
  BETTER_AUTH_URL: z.string().url(),
  WEB_ORIGIN: z.string().url(),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  APP_ENCRYPTION_KEY: z.string().regex(/^[0-9a-f]{64}$/i, 'APP_ENCRYPTION_KEY harus 64 karakter hex'),
  STORAGE_DIR: z.string().default('./storage'),
  /** Zona waktu kerja untuk pengelompokan per hari (WIB = +07:00). */
  APP_TZ_OFFSET: z
    .string()
    .regex(/^[+-]\d{2}:\d{2}$/, 'APP_TZ_OFFSET harus berformat +07:00')
    .default('+07:00'),
  RUN_WORKER: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
});

export const env = envSchema.parse(process.env);
