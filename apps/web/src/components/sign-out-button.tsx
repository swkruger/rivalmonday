'use client';
import { Button } from '@cs/ui';
import { useRouter } from 'next/navigation';
import { endSession } from '@/app/(app)/actions';
import { authClient } from '@/lib/auth-client';

/**
 * S1: navigates with `useRouter().push`, not by assigning `window.location` (jsdom forbids redefining it).
 * Important I1 (final review): also clears the guest/membership-pick cookies via `endSession`, so a stale
 * `rm_guest` session set by an earlier email link cannot survive this click.
 */
export function SignOutButton() {
  const router = useRouter();
  return (
    <Button
      variant="outline"
      onClick={async () => {
        // Phase 8b: first, while the Better Auth session still identifies the user, so an open support session ends too.
        // Sign-out never depends on endSession (the DB): its failure must not keep the user signed in.
        try {
          await endSession();
        } catch {
          // already logged server-side; continue signing out
        }
        try {
          await authClient.signOut();
        } finally {
          router.push('/sign-in');
        }
      }}
    >
      Sign out
    </Button>
  );
}
