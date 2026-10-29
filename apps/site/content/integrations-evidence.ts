// Repo-relative paths from the claims ledger (rows int-<slug>). Kept apart from integrations.ts: that module reaches
// the client bundle through the page registry, and the bundle check refuses server-package paths.
export const INTEGRATION_VERIFIED_IN: Record<string, readonly string[]> = {
  openrouter: ['packages/ai/config/ai.yaml'],
  anthropic: ['packages/ai/src/anthropic-batch.ts'],
  neon: ['packages/db/src/tenant.ts', 'packages/db/migrations/0001_rls.sql'],
  vercel: ['docs/DEPLOY.md'],
  railway: ['apps/worker/railway.json'],
  cloudflare: [
      'packages/storage/src/r2.ts',
      'apps/web/src/server/turnstile.ts',
      'apps/web/src/app/api/waitlist/route.ts',
    ],
  postmark: ['packages/email/src/transport.ts', 'apps/web/src/app/api/postmark/webhook/route.ts'],
  stripe: ['packages/billing/src/stripe-gateway.ts', 'packages/billing/src/connect-fee.ts'],
  sentry: ['apps/worker/src/sentry.ts', 'apps/site/src/lib/sentry-options.ts', 'packages/core/src/server/log.ts'],
};
