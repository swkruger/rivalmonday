import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

try {
  process.loadEnvFile(fileURLToPath(new URL('../../.env', import.meta.url)));
} catch {
  // optional
}

export default defineConfig({ test: { testTimeout: 20_000 } });
