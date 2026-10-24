import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

try {
  process.loadEnvFile(fileURLToPath(new URL('../../.env', import.meta.url)));
} catch {
  // repo-root .env is optional (e.g. CI, where env vars are injected directly)
}

// No DB global-setup: unit tests here never touch Postgres (prepareTestDb is only called by the Ask suite at run time).
export default defineConfig({ test: { testTimeout: 20_000 } });
