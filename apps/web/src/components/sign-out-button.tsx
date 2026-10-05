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
        await authClient.signOut();
        await endSession();
        router.push('/sign-in');
      }}
    >
      Sign out
    </Button>
  );
}
