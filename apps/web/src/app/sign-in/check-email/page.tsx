import Link from 'next/link';
import { AuthCard } from '@/components/auth-card';
import { defaultBranding } from '@/server/branding';
import { dbs } from '@/server/db';
import { webEnv } from '@/server/env';

export const dynamic = 'force-dynamic';

/** Same copy whether or not an email was actually sent (decision 2) — this page never reveals who may sign in. */
export default async function CheckEmailPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const signup = (await searchParams).for === 'signup';
  const env = webEnv();
  return (
    <AuthCard branding={await defaultBranding(dbs().service, env)} title="Check your email">
      {signup ? (
        <>
          <p className="text-ink">Check your inbox. If you can create an agency with this address, we&apos;ve sent a link to confirm it. The link works for 15 minutes.</p>
          <Link href="/sign-up" className="mt-4 inline-block text-sm text-secondary underline">
            Back to sign-up
          </Link>
        </>
      ) : (
        <>
          <p className="text-ink">If this address has access, a sign-in link is on its way. It works once and expires in 15 minutes.</p>
          <Link href="/sign-in" className="mt-4 inline-block text-sm text-secondary underline">
            Back to sign in
          </Link>
        </>
      )}
    </AuthCard>
  );
}
