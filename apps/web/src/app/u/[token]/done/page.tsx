import { notFound } from 'next/navigation';
import { AuthCard } from '@/components/auth-card';
import { defaultBranding } from '@/server/branding';
import { dbs } from '@/server/db';
import { webEnv } from '@/server/env';
import { unsubscribeTarget } from '@/server/unsubscribe';

export const dynamic = 'force-dynamic';

/** Phase 10: shown after the confirm form's POST to `/u/<token>`. Read-only. */
export default async function UnsubscribeDonePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const env = webEnv();
  const service = dbs().service;
  if (!(await unsubscribeTarget(service, token, env.authSecret))) notFound();
  return (
    <AuthCard branding={await defaultBranding(service, env)} title="Setup tips">
      <p className="text-ink">You won&apos;t get setup tips any more.</p>
    </AuthCard>
  );
}
