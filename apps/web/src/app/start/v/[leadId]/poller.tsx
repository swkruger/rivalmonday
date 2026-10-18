'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

const EVERY_MS = 3_000;
const MAX_MS = 120_000;

/**
 * Re-renders the preview page every 3 s while the snapshot is building; after 2 minutes it stops and says the snapshot
 * will arrive by email. Once the server renders `ready`/`failed` this component unmounts.
 */
export function PreviewPoller() {
  const router = useRouter();
  const routerRef = useRef(router);
  useEffect(() => {
    routerRef.current = router;
  });
  const [gaveUp, setGaveUp] = useState(false);
  useEffect(() => {
    let ticks = 0;
    const timer = setInterval(() => {
      ticks += 1;
      if (ticks * EVERY_MS >= MAX_MS) {
        clearInterval(timer);
        setGaveUp(true);
      } else routerRef.current.refresh();
    }, EVERY_MS);
    return () => clearInterval(timer);
  }, []); // runs once per mount: giving up must not restart the interval
  return (
    <p role="status" aria-live="polite" className="text-ink">
      {gaveUp ? "Your snapshot is taking longer than usual — we'll email it to you." : 'Building your snapshot…'}
    </p>
  );
}
