import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

try {
  process.loadEnvFile(fileURLToPath(new URL('../../.env', import.meta.url)));
} catch {
  // repo-root .env is optional (e.g. CI, where env vars are injected directly)
}

// No DB global-setup: only the Ask suite touches Postgres, and its runner calls prepareTestDb itself (run.test.ts, eval run).
export default defineConfig({ test: { testTimeout: 20_000 } });
