import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Integration tests share one Postgres test database.
    fileParallelism: false,
    globalSetup: ['./test/global-setup.ts'],
    env: { NODE_ENV: 'test' },
    testTimeout: 20_000,
  },
});
