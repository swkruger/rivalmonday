import type { TimedFetch } from '@cs/core/server';
import type { EnvName } from '@cs/db';
import type { PostmarkDomains, VercelDomains } from './errors';
import { fakePostmarkDomains, fakeVercelDomains } from './fakes';
import { createPostmarkDomains } from './postmark';
import { createVercelDomains } from './vercel';

export { DomainVendorError, type DomainVendorErrorCode, type PostmarkDomainState, type PostmarkDomains, type VercelDomainState, type VercelDomains } from './errors';

export interface DomainVendorOptions {
  /** false = ignore `DOMAINS_FAKE_VENDORS` (the worker; mirrors `gatewayFor`). Default true. */
  allowFakeFlag?: boolean;
  /** Per-vendor fetch, e.g. the worker's `limiter.limitedFetch('vercel')` (N6). Default: plain `timedFetch`. */
  fetch?: { vercel?: TimedFetch; postmark?: TimedFetch };
}

/**
 * 13a1 P11/R8: fakes for DEMO/TEST databases, Vitest/`NODE_ENV=test` and `DOMAINS_FAKE_VENDORS=1` (E2E only; the web env
 * refuses it on any VERCEL_ENV; ignored with `allowFakeFlag: false`). Otherwise each vendor is real when its credentials are
 * set (Vercel: `VERCEL_API_TOKEN` + `VERCEL_PROJECT_ID`, optional `VERCEL_TEAM_ID`; Postmark: `POSTMARK_ACCOUNT_TOKEN`), else
 * null — domain write tools refuse. A real process never falls back to the fakes.
 */
export function domainVendorsFor(env: NodeJS.ProcessEnv, envName: EnvName, opts: DomainVendorOptions = {}): { vercel: VercelDomains | null; postmark: PostmarkDomains | null; fake: boolean } {
  const fakeFlag = opts.allowFakeFlag !== false && env.DOMAINS_FAKE_VENDORS?.trim() === '1';
  if (envName === 'demo' || envName === 'test' || !!env.VITEST || env.NODE_ENV === 'test' || fakeFlag) {
    return { vercel: fakeVercelDomains(), postmark: fakePostmarkDomains(), fake: true };
  }
  const vToken = env.VERCEL_API_TOKEN?.trim();
  const projectId = env.VERCEL_PROJECT_ID?.trim();
  const pmToken = env.POSTMARK_ACCOUNT_TOKEN?.trim();
  return {
    vercel: vToken && projectId ? createVercelDomains({ token: vToken, projectId, teamId: env.VERCEL_TEAM_ID?.trim() || undefined, fetch: opts.fetch?.vercel }) : null,
    postmark: pmToken ? createPostmarkDomains({ token: pmToken, fetch: opts.fetch?.postmark }) : null,
    fake: false,
  };
}
