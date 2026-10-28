'use client';

import { useEffect, useState } from 'react';

/**
 * Tracks a media query. Returns `null` until `matchMedia` has run (SSR and the first client paint), so server and
 * first-paint markup agree. Without `matchMedia` (old jsdom) it stays `null`.
 */
export function useMediaQuery(query: string): boolean | null {
  const [matches, setMatches] = useState<boolean | null>(null);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia(query);
    setMatches(mq.matches);
    const onChange = (e: { matches: boolean }) => setMatches(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}
