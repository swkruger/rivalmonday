import Link from 'next/link';
import { AuthCard } from '@/components/auth-card';
import { defaultBranding } from '@/server/branding';
import { dbs } from '@/server/db';
import { webEnv } from '@/server/env';

export const dynamic = 'force-dynamic';

export default async function LinkExpiredPage() {
  const env = webEnv();
  return (
    <AuthCard branding={await defaultBranding(dbs().service, env)} title="This link has expired">
      <p className="text-ink">
        Links in our emails work for 30 days, and stop working if you were removed as a recipient. Sign in to see the latest brief.
      </p>
      <Link href="/sign-in" className="mt-4 inline-block text-sm text-secondary underline">
        Sign in
      </Link>
    </AuthCard>
  );
}
