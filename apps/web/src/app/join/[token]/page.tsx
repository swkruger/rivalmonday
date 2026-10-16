import { checkInviteLink } from '@cs/tools';
import { AuthCard } from '@/components/auth-card';
import { defaultBranding } from '@/server/branding';
import { dbs } from '@/server/db';
import { activeEnvName } from '@/server/dev-guard';
import { webEnv } from '@/server/env';
import { SignUpForm } from '../../sign-up/sign-up-form';
import { discountText, offerBanner } from './offer';

export const dynamic = 'force-dynamic';

/** Redeems a 9a invite link. Unknown, revoked, expired and used-up links all show the same page. */
export default async function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const env = webEnv();
  const service = dbs().service;
  const branding = await defaultBranding(service, env);
  const check = await checkInviteLink(service, token, null, new Date());
  if (!check.ok) {
    return (
      <AuthCard branding={branding} title="Invite link">
        <p className="text-ink">This invite link is no longer valid. Ask the person who sent it for a new one.</p>
      </AuthCard>
    );
  }
  const { link } = check;
  return (
    <AuthCard branding={branding} title={link.offer === 'pilot' ? 'Join the Rival Monday pilot' : 'Start your Rival Monday trial'}>
      <p className="mb-4 rounded-lg bg-muted-surface p-3 text-ink">{offerBanner(link, await discountText(service, link))}</p>
      <SignUpForm
        googleEnabled={env.google !== null}
        siteKey={activeEnvName() === 'dev' ? (env.turnstile?.siteKey ?? null) : null}
        inviteToken={token}
        lockedEmail={link.emailLock ?? null}
      />
    </AuthCard>
  );
}
