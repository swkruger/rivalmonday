import { verifyOAuthQueryParams } from '@better-auth/oauth-provider';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AuthCard } from '@/components/auth-card';
import { authBranding, authHintFromNext, authTitle } from '@/server/branding';
import { getViewer } from '@/server/current-viewer';
import { dbs } from '@/server/db';
import { webEnv } from '@/server/env';
import { oauthResumePath } from '@/server/oauth-consent';
import { safeNext } from '@/server/safe-next';
import { SignInForm } from './sign-in-form';

export const dynamic = 'force-dynamic';

type Params = Record<string, string | string[] | undefined>;

/**
 * 15a §2.10: a `next=/c/<id>/…` (client invites, signed email links, `/go/` links) brands the page with that client's
 * agency. An OAuth resume (signed authorize query, no `next`) carries no client, so it is neutral or the host's agency.
 */
const brandingFor = (params: Params) =>
  authBranding(dbs().service, webEnv(), typeof params.sig === 'string' ? null : authHintFromNext(safeNext(typeof params.next === 'string' ? params.next : undefined)));

export async function generateMetadata({ searchParams }: { searchParams: Promise<Params> }): Promise<Metadata> {
  return { title: authTitle('Sign in', await brandingFor(await searchParams)) };
}

/**
 * S10: Better Auth owns/overwrites the `error` query param on its own redirects, so a bad magic link or OAuth
 * attempt comes back here as `?reason=link` / `?reason=google` instead (see `sign-in-form.tsx`).
 */
export default async function SignInPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const env = webEnv();
  // Ruling R7: the OAuth provider sends a signed-out user here with its signed authorize query and no `next`; resume
  // the authorize request after sign-in (both the form's callback and the already-signed-in redirect).
  const oauthNext = await oauthResumePath(params, env.authSecret, verifyOAuthQueryParams);
  const target = safeNext(oauthNext ?? (typeof params.next === 'string' ? params.next : undefined));
  const reason = typeof params.reason === 'string' ? params.reason : null;
  const emailHint = typeof params.email === 'string' ? params.email : null;
  const viewer = await getViewer();
  if (viewer && viewer.kind !== 'guest') redirect(target);
  return (
    <AuthCard branding={await brandingFor(params)} title="Sign in">
      <SignInForm next={target} googleEnabled={env.google !== null} error={reason} emailHint={emailHint} />
    </AuthCard>
  );
}
