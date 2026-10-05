import { redirect } from 'next/navigation';
import { AuthCard } from '@/components/auth-card';
import { SignOutButton } from '@/components/sign-out-button';
import { defaultBranding } from '@/server/branding';
import { requireViewer } from '@/server/current-viewer';
import { dbs } from '@/server/db';
import { webEnv } from '@/server/env';

export const dynamic = 'force-dynamic';

export default async function NoAccessPage() {
  const viewer = await requireViewer();
  if (viewer.kind !== 'member-less') redirect('/');
  const env = webEnv();
  return (
    <AuthCard branding={await defaultBranding(dbs().service, env)} title="No workspace yet">
      <p className="text-ink">
        You are signed in as {viewer.email}, but you have not been added to a workspace. Ask your account manager for an invitation.
      </p>
      <div className="mt-4">
        <SignOutButton />
      </div>
    </AuthCard>
  );
}
