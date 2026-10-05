import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Test integrasi memakai database terpisah (manpro_test) dan berjalan berurutan.
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 60000,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: 'mysql://root@localhost:3306/2026_manpro_test',
      BETTER_AUTH_SECRET: 'test-secret-test-secret-test-secret-123',
      BETTER_AUTH_URL: 'http://localhost:3000',
      WEB_ORIGIN: 'http://localhost:5173',
      REDIS_URL: 'redis://localhost:6379',
      APP_ENCRYPTION_KEY: '0'.repeat(64),
      STORAGE_DIR: './storage-test',
      RUN_WORKER: 'true',
    },
  },
});
