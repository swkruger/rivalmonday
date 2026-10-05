'use client';
import { Button } from '@cs/ui';
import { useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth-client';

/** S1: navigates with `useRouter().push`, not by assigning `window.location` (jsdom forbids redefining it). */
export function SignOutButton() {
  const router = useRouter();
  return (
    <Button
      variant="outline"
      onClick={async () => {
        await authClient.signOut();
        router.push('/sign-in');
      }}
    >
      Sign out
    </Button>
  );
}
