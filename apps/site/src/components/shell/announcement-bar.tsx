'use client';

import { useEffect, useState } from 'react';
import { ANNOUNCEMENT } from '../../../content/home';
import { useJoin } from '../join/join-provider';
import { usePilot } from './pilot-context';

const ROTATE_MS = 3_000;

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Pilot-only strip above the header. Examples rotate every 3 s; static (first example) under reduced motion. */
export function AnnouncementBar() {
  const { pilotMode } = usePilot();
  const { open } = useJoin();
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    setReduced(prefersReducedMotion());
  }, []);

  useEffect(() => {
    if (!pilotMode || paused || reduced) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % ANNOUNCEMENT.examples.length), ROTATE_MS);
    return () => clearInterval(id);
  }, [pilotMode, paused, reduced]);

  if (!pilotMode) return null;

  return (
    <div
      data-slot="announcement-bar"
      className="border-b border-line bg-muted-surface text-13 text-ink"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div className="site-container flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5 py-2 text-center">
        <p className="min-w-0">
          {ANNOUNCEMENT.lead}{' '}
          <span aria-live="off">
            — like <span data-testid="announcement-example" className="font-semibold">{ANNOUNCEMENT.examples[index]}</span>
          </span>
        </p>
        <button type="button" onClick={() => open('choose')} className="font-semibold text-link underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
          {ANNOUNCEMENT.link}
        </button>
      </div>
    </div>
  );
}
