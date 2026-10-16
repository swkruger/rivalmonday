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
  return (
    <AuthCard branding={await defaultBranding(dbs().service, env)} title="Start your Rival Monday trial">
      <p className="mb-4 text-ink">Monitor your clients&apos; competitors from public information. 30 days, no card needed.</p>
      <SignUpForm
        googleEnabled={env.google !== null}
        siteKey={activeEnvName() === 'dev' ? (env.turnstile?.siteKey ?? null) : null}
        reason={typeof params.reason === 'string' ? params.reason : null}
      />
    </AuthCard>
  );
}
