import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';

try {
  process.loadEnvFile(fileURLToPath(new URL('../../.env', import.meta.url)));
} catch {
  // repo-root .env is optional (Vercel injects env vars directly)
}

const config: NextConfig = {
  // Workspace packages ship TypeScript source.
  transpilePackages: ['@cs/core', '@cs/db', '@cs/demo', '@cs/email', '@cs/engine', '@cs/storage', '@cs/tools', '@cs/ui', '@cs/ai', '@cs/collectors', '@cs/verticals'],
  // Native/heavy server dependencies pulled in through @cs/engine → @cs/collectors; never bundled.
  serverExternalPackages: ['playwright', 'playwright-core', 'pg-boss', 'pg', 'postgres', 'compromise', 'cheerio', 'pdf-lib'],
  poweredByHeader: false,
};

export default config;
