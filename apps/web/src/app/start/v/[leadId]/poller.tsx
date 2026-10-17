'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

const EVERY_MS = 3_000;
const MAX_MS = 120_000;

/**
 * Re-renders the preview page every 3 s while the snapshot is building; after 2 minutes it stops and says the snapshot
 * will arrive by email. Once the server renders `ready`/`failed` this component unmounts.
 */
export function PreviewPoller() {
  const router = useRouter();
  const [gaveUp, setGaveUp] = useState(false);
  useEffect(() => {
    const started = Date.now();
    const timer = setInterval(() => {
      if (Date.now() - started >= MAX_MS) {
        clearInterval(timer);
        setGaveUp(true);
      } else router.refresh();
    }, EVERY_MS);
    return () => clearInterval(timer);
  }, [router]);
  return (
    <p role="status" aria-live="polite" className="text-ink">
      {gaveUp ? "Your snapshot is taking longer than usual — we'll email it to you." : 'Building your snapshot…'}
    </p>
  );
}
