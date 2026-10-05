'use client';
import { useRouter } from 'next/navigation';
import { endSession } from '@/app/(app)/actions';

/**
 * Important I1 (final review): a guest (email-link) viewer has no Better Auth session, so this only clears the
 * `rm_guest`/`rm_membership` cookies via `endSession` — never `authClient.signOut()`. Navigates with
 * `useRouter().push`, never `window.location`.
 */
export function GuestSignOutButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={async () => {
        await endSession();
        router.push('/sign-in');
      }}
      className="flex-shrink-0 font-semibold text-primary-soft-text"
    >
      Sign out
    </button>
  );
}
