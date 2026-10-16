import { inviteProblemForLink } from '@cs/tools';
import { Button } from '@cs/ui';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AuthCard } from '@/components/auth-card';
import { defaultBranding } from '@/server/branding';
import { getViewer } from '@/server/current-viewer';
import { dbs } from '@/server/db';
import { webEnv } from '@/server/env';
import { openPendingSignup } from '@/server/pending-signup';
import { problemCopy } from './copy';

export const dynamic = 'force-dynamic';

/**
 * Where a signed-in user with no membership lands when their agency could not be created. No cookie carries the reason:
 * it is re-derived from their open sign-up row and its invite link (P6).
 */
export default async function SignUpProblemPage() {
  const viewer = await getViewer();
  if (!viewer) redirect('/sign-in');
  if (viewer.kind !== 'member-less') redirect('/agency');
  const service = dbs().service;
  const now = new Date();
  const pending = await openPendingSignup(service, viewer.email, now);
  const problem = pending?.inviteLinkId ? await inviteProblemForLink(service, pending.inviteLinkId, viewer.email, now) : null;
  return (
    <AuthCard branding={await defaultBranding(service, webEnv())} title="We couldn't create your agency">
      <p className="text-ink">{problemCopy(problem)}</p>
      <Button asChild className="mt-4">
        <Link href="/sign-up">Back to sign-up</Link>
      </Button>
    </AuthCard>
  );
}
