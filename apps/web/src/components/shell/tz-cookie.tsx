'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

const COOKIE = 'rm_tz';

function currentCookie(): string | null {
  const hit = document.cookie.split('; ').find((c) => c.startsWith(`${COOKIE}=`));
  if (!hit) return null;
  try {
    return decodeURIComponent(hit.slice(COOKIE.length + 1));
  } catch {
    return null;
  }
}

/**
 * Phase 15c: tells the server which time zone the viewer is in (cookie `rm_tz`, read by `viewerTimeZone()`). Writes the
 * cookie and refreshes only when it changed, so there is no refresh loop. Not httpOnly (client-written); holds no PII.
 */
export function TzCookie(): null {
  const router = useRouter();
  useEffect(() => {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!zone || currentCookie() === zone) return;
    const secure = window.location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = `${COOKIE}=${encodeURIComponent(zone)}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
    router.refresh();
  }, [router]);
  return null;
}
