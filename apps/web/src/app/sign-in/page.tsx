import { redirect } from 'next/navigation';
import { AuthCard } from '@/components/auth-card';
import { defaultBranding } from '@/server/branding';
import { getViewer } from '@/server/current-viewer';
import { dbs } from '@/server/db';
import { webEnv } from '@/server/env';
import { safeNext } from '@/server/safe-next';
import { SignInForm } from './sign-in-form';

export const dynamic = 'force-dynamic';

/**
 * S10: Better Auth owns/overwrites the `error` query param on its own redirects, so a bad magic link or OAuth
 * attempt comes back here as `?reason=link` / `?reason=google` instead (see `sign-in-form.tsx`).
 */
export default async function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string; reason?: string }> }) {
  const { next, reason } = await searchParams;
  const target = safeNext(next);
  const viewer = await getViewer();
  if (viewer && viewer.kind !== 'guest') redirect(target);
  const env = webEnv();
  return (
    <AuthCard branding={await defaultBranding(dbs().service, env)} title="Sign in">
      <SignInForm next={target} googleEnabled={env.google !== null} error={reason ?? null} />
    </AuthCard>
  );
}
