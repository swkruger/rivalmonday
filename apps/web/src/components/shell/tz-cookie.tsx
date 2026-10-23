'use client';

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
 * cookie only when it changed; it never refreshes (times rendered before it existed show "UTC" with a zone label). Not httpOnly (client-written); holds no PII.
 */
export function TzCookie(): null {
  useEffect(() => {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!zone || currentCookie() === zone) return;
    const secure = window.location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = `${COOKIE}=${encodeURIComponent(zone)}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
  }, []);
  return null;
}
