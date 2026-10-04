import { defineConfig } from 'vitest/config';

export default defineConfig({ esbuild: { jsx: 'automatic' }, test: { testTimeout: 20_000 } });
