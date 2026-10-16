'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';

export const REFRESH_EVERY_MS = 2000;
export const MAX_REFRESHES = 15;

/**
 * After a return from Stripe the page usually renders before the webhook lands. Re-fetches the route (page and layout,
 * so the shell's billing banner too) every 2 s until `watch` differs from its value at mount, at most 15 times.
 */
export function RefreshUntilChanged({ watch }: { watch: string }) {
  const router = useRouter();
  const initial = useRef(watch);
  const changed = watch !== initial.current;
  useEffect(() => {
    if (changed) return;
    let n = 0;
    const id = setInterval(() => {
      n += 1;
      router.refresh();
      if (n >= MAX_REFRESHES) clearInterval(id);
    }, REFRESH_EVERY_MS);
    return () => clearInterval(id);
  }, [changed, router]);
  return null;
}
