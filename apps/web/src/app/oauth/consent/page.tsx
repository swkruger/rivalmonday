import { verifyOAuthQueryParams } from '@better-auth/oauth-provider';
import { productNameFor } from '@cs/mcp';
import { redirect } from 'next/navigation';
import { AuthCard } from '@/components/auth-card';
import { defaultBranding } from '@/server/branding';
import { getViewer } from '@/server/current-viewer';
import { dbs } from '@/server/db';
import { webEnv } from '@/server/env';
import { consentOptions, oauthClientName, oauthQueryFrom, redirectHostOf } from '@/server/oauth-consent';
import { safeNext } from '@/server/safe-next';
import { ConsentForm } from './consent-form';

export const dynamic = 'force-dynamic';

/**
 * Phase 6a: the OAuth provider's consent page. The plugin sends the signed authorize query here (valid 600 s); the
 * user picks one workspace (membership) and an access level, and `decideConsent` binds the grant to it (P9).
 */
export default async function ConsentPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const env = webEnv();
  const service = dbs().service;
  const oauthQuery = oauthQueryFrom(await searchParams);
  const viewer = await getViewer();
  if (!viewer || viewer.kind === 'guest') redirect(`/sign-in?next=${encodeURIComponent(safeNext(`/oauth/consent?${oauthQuery}`))}`);
  const branding = await defaultBranding(service, env);
  const q = new URLSearchParams(oauthQuery);
  const valid = await verifyOAuthQueryParams(oauthQuery, env.authSecret).catch(() => false);
  const app = valid ? await oauthClientName(service, q.get('client_id') ?? '') : null;
  if (!app) {
    return (
      <AuthCard branding={branding} title="Connect an app">
        <p className="text-ink">This request has expired. Start again from your AI app.</p>
      </AuthCard>
    );
  }
  const options = await consentOptions(service, viewer.userId, q.get('scope'));
  const agencies = [...new Set(options.map((o) => o.agencyId))];
  const productName = agencies.length === 1 ? await productNameFor(service, agencies[0]!) : branding.displayName;
  const appName = app.name ?? 'This app';
  return (
    <AuthCard branding={branding} title={`Connect ${appName} to ${productName}`}>
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
