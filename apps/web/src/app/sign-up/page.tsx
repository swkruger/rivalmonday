import { pilotMode, signupsPaused } from '@cs/tools';
import Link from 'next/link';
import { AuthCard } from '@/components/auth-card';
import { OnboardingShell } from '@/components/onboarding/onboarding-shell';
import { SignupAside } from '@/components/onboarding/signup-aside';
import { PRIVACY_URL } from '@/lib/links';
import { defaultBranding } from '@/server/branding';
import { dbs } from '@/server/db';
import { activeEnvName } from '@/server/dev-guard';
import { webEnv } from '@/server/env';
import { siteJoinUrl } from '@/server/site-origin';
import { SignUpForm } from './sign-up-form';

export const dynamic = 'force-dynamic';

/** Public. Signed-in users see the form too (a second agency). Better Auth failures come back as `?reason=`. */
export default async function SignUpPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const env = webEnv();
  const service = dbs().service;
  // Both switches are also enforced server-side in startAgencySignup; invite links (/join) are unaffected. Pilot wins over paused.
  if (await pilotMode(service)) {
    return (
      <AuthCard branding={await defaultBranding(service, env)} title="Rival Monday is in pilot">
        <p className="text-ink">We&apos;re opening places to agencies a few at a time. Join the waitlist and we&apos;ll email you an invite when yours is ready.</p>
        <p className="mt-4">
          <a href={siteJoinUrl(env)} className="font-semibold text-ink underline">
            Join the waitlist
          </a>
        </p>
        <p className="mt-4 text-sm text-ink">Already have an invite? Open the link in your invite email.</p>
        <p className="mt-4 text-sm text-ink">
          Already have an account?{' '}
          <Link href="/sign-in" className="font-semibold underline">
            Sign in
          </Link>
        </p>
      </AuthCard>
    );
  }
  if (await signupsPaused(service)) {
    return (
      <AuthCard branding={await defaultBranding(service, env)} title="Start your Rival Monday trial">
        <p className="text-ink">New sign-ups are paused right now. Contact support@rivalmonday.app and we&apos;ll get you set up.</p>
        <p className="mt-4 text-sm text-ink">
          Already have an account?{' '}
          <Link href="/sign-in" className="font-semibold underline">
            Sign in
          </Link>
        </p>
      </AuthCard>
    );
  }
  return (
    <OnboardingShell
      brand={{ kind: 'platform' }}
      exit={{ href: '/sign-in', label: 'Have an account? Sign in' }}
      title="Start your free 30-day trial"
      subtitle="No card needed. Watch your clients' competitors from public information, with a brief every Monday."
      preview={<SignupAside />}
      footer={
        <p className="mt-auto max-w-[440px] pt-8 text-xs text-muted-ink">
          By creating an account you agree to how we handle your details, as described in our{' '}
          <a href={PRIVACY_URL} className="underline" target="_blank" rel="noreferrer">
            privacy policy
          </a>
          .
        </p>
      }
    >
      <SignUpForm
        googleEnabled={env.google !== null}
        siteKey={activeEnvName() === 'dev' ? (env.turnstile?.siteKey ?? null) : null}
        reason={typeof params.reason === 'string' ? params.reason : null}
      />
    </OnboardingShell>
  );
}
