import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';

try {
  process.loadEnvFile(fileURLToPath(new URL('../../.env', import.meta.url)));
} catch {
  // repo-root .env is optional (Vercel injects env vars directly)
}

const config: NextConfig = {
  // Workspace packages ship TypeScript source.
  transpilePackages: ['@cs/ask', '@cs/billing', '@cs/core', '@cs/db', '@cs/demo', '@cs/email', '@cs/engine', '@cs/mcp', '@cs/storage', '@cs/tools', '@cs/ui', '@cs/ai', '@cs/collectors', '@cs/verticals'],
  // Native/heavy server dependencies pulled in through @cs/engine → @cs/collectors; never bundled.
  serverExternalPackages: ['playwright', 'playwright-core', 'pg-boss', 'pg', 'postgres', 'compromise', 'cheerio', 'pdf-lib'],
  poweredByHeader: false,
  // Phase 15a §2.6 (D15): agency pages moved under `/agency/settings/`; old bookmarks keep working (308, path + query kept).
  async redirects() {
    return [
      { source: '/agency/team/:path*', destination: '/agency/settings/team/:path*', permanent: true },
      { source: '/agency/branding/:path*', destination: '/agency/settings/branding/:path*', permanent: true },
      { source: '/agency/webhooks/:path*', destination: '/agency/settings/slack-teams/:path*', permanent: true },
      { source: '/agency/ai/:path*', destination: '/agency/settings/ai/:path*', permanent: true },
      { source: '/agency/usage/:path*', destination: '/agency/settings/usage/:path*', permanent: true },
      // Phase 14b: the runbook replaces Playbooks; both old Playbooks paths land on it.
      { source: '/agency/playbooks/:path*', destination: '/agency/settings/runbook/:path*', permanent: true },
      { source: '/agency/settings/playbooks/:path*', destination: '/agency/settings/runbook/:path*', permanent: true },
    ];
  },
};

export default config;
