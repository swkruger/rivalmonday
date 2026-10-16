import { Button } from '@cs/ui';
import { notFound } from 'next/navigation';
import { AuthCard } from '@/components/auth-card';
import { defaultBranding } from '@/server/branding';
import { dbs } from '@/server/db';
import { webEnv } from '@/server/env';
import { unsubscribeTarget } from '@/server/unsubscribe';

export const dynamic = 'force-dynamic';

/** Phase 10: confirm stopping setup tips. Rendering changes nothing; the button POSTs to the `/u/<token>` route. */
export default async function UnsubscribeConfirmPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const env = webEnv();
  const service = dbs().service;
  const target = await unsubscribeTarget(service, token, env.authSecret);
  if (!target) notFound();
  return (
    <AuthCard branding={await defaultBranding(service, env)} title="Setup tips">
      <p className="text-ink">Stop setup tips for {target.agencyName}?</p>
      <form method="post" action={`/u/${token}`} className="mt-4">
        <Button type="submit">Unsubscribe</Button>
      </form>
    </AuthCard>
  );
}
