import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthCard } from '@/components/auth-card';
import { authBranding, authHintFromNext, authTitle, defaultBranding } from '@/server/branding';
import { dbs } from '@/server/db';
import { webEnv } from '@/server/env';
import { safeNext } from '@/server/safe-next';

export const dynamic = 'force-dynamic';

type Params = Record<string, string | string[] | undefined>;
const nextOf = (params: Params) => (typeof params.next === 'string' ? safeNext(params.next) : null);

/** 15a §2.10: sign-in's check-email brands by the `next` client's agency (or is neutral); sign-up's is agency-facing (P4). */
const brandingFor = (params: Params) =>
  params.for === 'signup' ? defaultBranding(dbs().service, webEnv()) : authBranding(dbs().service, webEnv(), authHintFromNext(nextOf(params)));

export async function generateMetadata({ searchParams }: { searchParams: Promise<Params> }): Promise<Metadata> {
  const params = await searchParams;
  return { title: params.for === 'signup' ? 'Check your email' : authTitle('Check your email', await brandingFor(params)) };
}

/** Same copy whether or not an email was actually sent (decision 2) — this page never reveals who may sign in. */
export default async function CheckEmailPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const signup = params.for === 'signup';
  const next = nextOf(params);
  return (
    <AuthCard branding={await brandingFor(params)} title="Check your email">
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
          <Link href={next && next !== '/' ? `/sign-in?next=${encodeURIComponent(next)}` : '/sign-in'} className="mt-4 inline-block text-sm text-secondary underline">
            Back to sign in
          </Link>
        </>
      )}
    </AuthCard>
  );
}
