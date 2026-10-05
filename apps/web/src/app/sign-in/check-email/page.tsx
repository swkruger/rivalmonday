import Link from 'next/link';
import { AuthCard } from '@/components/auth-card';
import { defaultBranding } from '@/server/branding';
import { dbs } from '@/server/db';
import { webEnv } from '@/server/env';

export const dynamic = 'force-dynamic';

/** Same copy whether or not an email was actually sent (decision 2) — this page never reveals who may sign in. */
export default async function CheckEmailPage() {
  const env = webEnv();
  return (
    <AuthCard branding={await defaultBranding(dbs().service, env)} title="Check your email">
      <p className="text-ink">If this address has access, a sign-in link is on its way. It works once and expires in 15 minutes.</p>
      <Link href="/sign-in" className="mt-4 inline-block text-sm text-secondary underline">
        Back to sign in
      </Link>
    </AuthCard>
  );
}
