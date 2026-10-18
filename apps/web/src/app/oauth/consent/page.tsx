import { verifyOAuthQueryParams } from '@better-auth/oauth-provider';
import { NEUTRAL_PRODUCT_NAME } from '@cs/mcp';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { AuthCard } from '@/components/auth-card';
import { authBranding, authTitle } from '@/server/branding';
import { getViewer } from '@/server/current-viewer';
import { dbs } from '@/server/db';
import { webEnv } from '@/server/env';
import { consentOptions, oauthClientName, oauthQueryFrom, redirectHostOf } from '@/server/oauth-consent';
import { safeNext } from '@/server/safe-next';
import { ConsentForm } from './consent-form';

export const dynamic = 'force-dynamic';

type Params = Record<string, string | string[] | undefined>;

/**
 * One read per request, shared by the tab title and the page. 15a §2.10: OAuth clients are dynamically registered by
 * AI apps and belong to no agency, so the agency is the one this user can bind the grant to — exactly one agency among
 * their options brands the page; none or several fall back to the host agency or a neutral card (never Rival Monday).
 */
const loadConsent = cache(async (oauthQuery: string, userId: string) => {
  const env = webEnv();
  const service = dbs().service;
  const q = new URLSearchParams(oauthQuery);
  const valid = await verifyOAuthQueryParams(oauthQuery, env.authSecret).catch(() => false);
  const app = valid ? await oauthClientName(service, q.get('client_id') ?? '') : null;
  const options = app ? await consentOptions(service, userId, q.get('scope')) : [];
  const agencies = [...new Set(options.map((o) => o.agencyId))];
  const branding = await authBranding(service, env, agencies.length === 1 ? { agencyId: agencies[0]! } : null);
  return { q, app, options, branding };
});

export async function generateMetadata({ searchParams }: { searchParams: Promise<Params> }): Promise<Metadata> {
  const viewer = await getViewer();
  if (!viewer || viewer.kind === 'guest') return { title: 'Connect an app' };
  return { title: authTitle('Connect an app', (await loadConsent(oauthQueryFrom(await searchParams), viewer.userId)).branding) };
}

/**
 * Phase 6a: the OAuth provider's consent page. The plugin sends the signed authorize query here (valid 600 s); the
 * user picks one workspace (membership) and an access level, and `decideConsent` binds the grant to it (P9).
 */
export default async function ConsentPage({ searchParams }: { searchParams: Promise<Params> }) {
  const oauthQuery = oauthQueryFrom(await searchParams);
  const viewer = await getViewer();
  if (!viewer || viewer.kind === 'guest') redirect(`/sign-in?next=${encodeURIComponent(safeNext(`/oauth/consent?${oauthQuery}`))}`);
  const { q, app, options, branding } = await loadConsent(oauthQuery, viewer.userId);
  if (!app) {
    return (
      <AuthCard branding={branding} title="Connect an app">
        <p className="text-ink">This request has expired. Start again from your AI app.</p>
      </AuthCard>
    );
  }
  const productName = branding?.displayName ?? null;
  const appName = app.name ?? 'This app';
  return (
    <AuthCard branding={branding} title={`Connect ${appName} to ${productName ?? NEUTRAL_PRODUCT_NAME}`}>
      <ConsentForm
        appName={appName}
        productName={productName}
        oauthQuery={oauthQuery}
        redirectHost={redirectHostOf(q.get('redirect_uri'))}
        options={options.map((o) => ({ membershipId: o.membershipId, label: o.label, scopes: o.scopes }))}
      />
    </AuthCard>
  );
}
