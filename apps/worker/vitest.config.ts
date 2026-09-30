import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

try {
  process.loadEnvFile(fileURLToPath(new URL('../../.env', import.meta.url)));
} catch {
  // repo-root .env is optional (e.g. CI, where env vars are injected directly)
}

export default defineConfig({
  test: {
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
