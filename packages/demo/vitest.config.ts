import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

try {
  process.loadEnvFile(fileURLToPath(new URL('../../.env', import.meta.url)));
} catch {
  // repo-root .env is optional (e.g. CI, where env vars are injected directly)
}

export default defineConfig({
  test: {
    globalSetup: ['../db/test/global-setup.ts'],
    fileParallelism: false,
    testTimeout: 120_000,
    // The coverage test seeds the whole data set on Neon in its beforeAll.
    hookTimeout: 900_000,
  },
});
