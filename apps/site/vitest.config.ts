import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// The site needs no database and no `.env`: no globalSetup, no env loading.
// Default environment is jsdom (components); node tests opt out with `// @vitest-environment node`.
export default defineConfig({
  esbuild: { jsx: 'automatic' },
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}', 'content/**/*.test.ts', 'scripts/**/*.test.ts'],
    setupFiles: ['./vitest.setup.ts'],
  },
});
