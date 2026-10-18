import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AuthCard } from '@/components/auth-card';
import { SignOutButton } from '@/components/sign-out-button';
import { authBranding, authTitle } from '@/server/branding';
import { requireViewer } from '@/server/current-viewer';
import { dbs } from '@/server/db';
import { webEnv } from '@/server/env';

export const dynamic = 'force-dynamic';

/** 15a §2.10: a member-less viewer has no agency — the host agency's card, else neutral. */
const branding = () => authBranding(dbs().service, webEnv(), null);

export async function generateMetadata(): Promise<Metadata> {
  return { title: authTitle('No workspace yet', await branding()) };
}

export default async function NoAccessPage() {
  const viewer = await requireViewer();
  if (viewer.kind !== 'member-less') redirect('/');
  return (
    <AuthCard branding={await branding()} title="No workspace yet">
      <p className="text-ink">
        You are signed in as {viewer.email}, but you have not been added to a workspace. Ask your account manager for an invitation.
      </p>
      <div className="mt-4">
        <SignOutButton />
      </div>
    </AuthCard>
  );
}
