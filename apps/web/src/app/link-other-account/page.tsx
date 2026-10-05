import { AuthCard } from '@/components/auth-card';
import { SignOutButton } from '@/components/sign-out-button';
import { defaultBranding } from '@/server/branding';
import { dbs } from '@/server/db';
import { webEnv } from '@/server/env';

export const dynamic = 'force-dynamic';

/**
 * Review Focus 1: a signed email link opened in a browser where someone else is already signed in must not grant
 * that signed-in user anything and must not silently replace their session — the link handler (Task 15) sends
 * here instead of acting on the link.
 */
export default async function LinkOtherAccountPage() {
  const env = webEnv();
  return (
    <AuthCard branding={await defaultBranding(dbs().service, env)} title="This link was sent to someone else">
      <p className="text-ink">You are signed in with a different account. Sign out, then open the link from your email again.</p>
      <div className="mt-4">
        <SignOutButton />
      </div>
    </AuthCard>
  );
}
