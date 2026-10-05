import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

try {
  process.loadEnvFile(fileURLToPath(new URL('../../.env', import.meta.url)));
} catch {
  // optional
}

export default defineConfig({
  esbuild: { jsx: 'automatic' },
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)), 'server-only': fileURLToPath(new URL('./test/server-only.ts', import.meta.url)) } },
  test: { include: ['src/**/*.test.{ts,tsx}'], globalSetup: ['../../packages/db/test/global-setup.ts'], fileParallelism: false, testTimeout: 30_000, hookTimeout: 60_000 },
});
