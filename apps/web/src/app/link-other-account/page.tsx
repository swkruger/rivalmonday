import type { Metadata } from 'next';
import { AuthCard } from '@/components/auth-card';
import { SignOutButton } from '@/components/sign-out-button';
import { authBranding, authTitle } from '@/server/branding';
import { dbs } from '@/server/db';
import { webEnv } from '@/server/env';

export const dynamic = 'force-dynamic';

/** 15a §2.10: the host agency's card, else neutral (the link's own agency is not shown to another account). */
const branding = () => authBranding(dbs().service, webEnv(), null);

export async function generateMetadata(): Promise<Metadata> {
  return { title: authTitle('Different account', await branding()) };
}

/**
 * Review Focus 1: a signed email link opened in a browser where someone else is already signed in must not grant
 * that signed-in user anything and must not silently replace their session — the link handler (Task 15) sends
 * here instead of acting on the link.
 */
export default async function LinkOtherAccountPage() {
  return (
    <AuthCard branding={await branding()} title="This link was sent to someone else">
      <p className="text-ink">You are signed in with a different account. Sign out, then open the link from your email again.</p>
      <div className="mt-4">
        <SignOutButton />
      </div>
    </AuthCard>
  );
}
