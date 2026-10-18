import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthCard } from '@/components/auth-card';
import { authBranding, authTitle } from '@/server/branding';
import { dbs } from '@/server/db';
import { webEnv } from '@/server/env';

export const dynamic = 'force-dynamic';

/**
 * 15a §2.10: no hint — the token that sent the visitor here may be tampered or unknown (Review Focus 3: same page for
 * all), so the card is the host agency's or neutral, never Rival Monday.
 */
const branding = () => authBranding(dbs().service, webEnv(), null);

export async function generateMetadata(): Promise<Metadata> {
  return { title: authTitle('Link expired', await branding()) };
}

export default async function LinkExpiredPage() {
  return (
    <AuthCard branding={await branding()} title="This link has expired">
      <p className="text-ink">
        Links in our emails work for 30 days, and stop working if you were removed as a recipient. Sign in to see the latest brief.
      </p>
      <Link href="/sign-in" className="mt-4 inline-block text-sm text-secondary underline">
        Sign in
      </Link>
    </AuthCard>
  );
}
