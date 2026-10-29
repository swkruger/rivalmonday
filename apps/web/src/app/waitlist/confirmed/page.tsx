import type { Metadata } from 'next';
import { AuthCard } from '@/components/auth-card';
import { defaultBranding } from '@/server/branding';
import { dbs } from '@/server/db';
import { webEnv } from '@/server/env';
import { siteJoinUrl } from '@/server/site-origin';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Waitlist', robots: { index: false } };

/** Phase 17a: where the waitlist confirmation link lands (public, no PageHeader). */
export default async function WaitlistConfirmedPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const expired = (await searchParams).expired !== undefined;
  const env = webEnv();
  const branding = await defaultBranding(dbs().service, env);
  return expired ? (
    <AuthCard branding={branding} title="This link has expired">
      <p className="text-ink">
        Confirmation links work for 7 days, and only the newest one works. Sign up again on{' '}
        <a href={siteJoinUrl(env)} className="font-semibold text-secondary underline">rivalmonday.com</a> and we&apos;ll send you a fresh link.
      </p>
    </AuthCard>
  ) : (
    <AuthCard branding={branding} title="You're confirmed">
      <p className="text-ink">Thanks — your email is confirmed and your place on the list is saved. We&apos;ll be in touch at this address, usually within a few working days.</p>
    </AuthCard>
  );
}
