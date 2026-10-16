import { signupsPaused } from '@cs/tools';
import { AuthCard } from '@/components/auth-card';
import { defaultBranding } from '@/server/branding';
import { dbs } from '@/server/db';
import { activeEnvName } from '@/server/dev-guard';
import { webEnv } from '@/server/env';
import { SignUpForm } from './sign-up-form';

export const dynamic = 'force-dynamic';

/** Public. Signed-in users see the form too (a second agency). Better Auth failures come back as `?reason=`. */
export default async function SignUpPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const env = webEnv();
  const service = dbs().service;
  const branding = await defaultBranding(service, env);
  // The switch is also enforced server-side in startAgencySignup; invite links (/join) are unaffected.
  if (await signupsPaused(service)) {
    return (
      <AuthCard branding={branding} title="Start your Rival Monday trial">
        <p className="text-ink">New sign-ups are paused right now. Contact support@rivalmonday.app and we&apos;ll get you set up.</p>
      </AuthCard>
    );
  }
  return (
    <AuthCard branding={branding} title="Start your Rival Monday trial">
      <p className="mb-4 text-ink">Monitor your clients&apos; competitors from public information. 30 days, no card needed.</p>
      <SignUpForm
        googleEnabled={env.google !== null}
        siteKey={activeEnvName() === 'dev' ? (env.turnstile?.siteKey ?? null) : null}
        reason={typeof params.reason === 'string' ? params.reason : null}
      />
    </AuthCard>
  );
}
